import "dotenv/config";

import http, { type IncomingMessage, type ServerResponse } from "http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import {
  createLivePlannerConfig,
  type DashboardEvent,
  type EmployeeSyncPayload,
  OfficeSimulationEngine,
} from "./simulationEngine.ts";
import {
  DeterministicSimulationRunner,
  replayScenario,
  type RunResult,
} from "../simulation/index.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST?.trim() || "127.0.0.1";
const LIVE_MODE_ENABLED = process.env.ENABLE_LIVE_MODE === "true";
const MAX_BODY_BYTES = 256 * 1024;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const LIVE_PATHS = new Set([
  "/api/status",
  "/api/meta",
  "/api/employees",
  "/api/start",
  "/api/stop",
  "/api/reset",
  "/api/test",
  "/api/employees/sync",
  "/events",
]);

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendEvent(response: ServerResponse, event: DashboardEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const declaredLength = request.headers?.["content-length"];
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    throw Object.assign(new Error("Request body exceeds 256 KiB."), {
      statusCode: 413,
    });
  }
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body exceeds 256 KiB."), {
        statusCode: 413,
      });
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

const clients = new Set<ServerResponse>();
const experimentRuns = new Map<string, DeterministicSimulationRunner>();
const defaultScenario = () =>
  JSON.parse(
    readFileSync(
      new URL("../../scenarios/refund-approval.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
let liveRuntime: OfficeSimulationEngine | null = null;

export function isLiveRuntimeInitialized(): boolean {
  return liveRuntime !== null;
}

function getLiveRuntime(): OfficeSimulationEngine {
  if (!liveRuntime) {
    liveRuntime = new OfficeSimulationEngine({
      planner: createLivePlannerConfig(),
    });
    liveRuntime.subscribe((event) => {
      for (const client of clients) sendEvent(client, event);
    });
  }
  return liveRuntime;
}

export async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (LIVE_PATHS.has(pathname) && !LIVE_MODE_ENABLED) {
    sendJson(response, 503, {
      error: "Live mode is disabled.",
      hint: "Set ENABLE_LIVE_MODE=true only in a trusted local environment.",
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/status") {
    sendJson(response, 200, getLiveRuntime().getStatusSnapshot());
    return;
  }

  if (request.method === "GET" && pathname === "/api/meta") {
    sendJson(response, 200, getLiveRuntime().getRunnerMeta());
    return;
  }

  if (request.method === "GET" && pathname === "/api/employees") {
    sendJson(response, 200, getLiveRuntime().getEmployeeSnapshot());
    return;
  }

  if (request.method === "POST" && pathname === "/api/start") {
    const runtime = getLiveRuntime();
    const result = runtime.start();
    sendJson(
      response,
      result.ok ? 200 : 409,
      result.ok ? runtime.getStatusSnapshot() : result,
    );
    return;
  }

  if (request.method === "POST" && pathname === "/api/stop") {
    const runtime = getLiveRuntime();
    const result = runtime.pause();
    sendJson(
      response,
      result.ok ? 200 : 409,
      result.ok ? runtime.getStatusSnapshot() : result,
    );
    return;
  }

  if (request.method === "POST" && pathname === "/api/reset") {
    sendJson(response, 200, getLiveRuntime().reset());
    return;
  }

  if (request.method === "POST" && pathname === "/api/test") {
    sendJson(response, 200, getLiveRuntime().runTest());
    return;
  }

  if (request.method === "POST" && pathname === "/api/employees/sync") {
    try {
      const payload = await readJsonBody<EmployeeSyncPayload>(request);
      if (!Array.isArray(payload.employees)) {
        sendJson(response, 400, { error: "Invalid employees payload." });
        return;
      }

      sendJson(response, 200, getLiveRuntime().syncEmployees(payload));
    } catch (error) {
      sendJson(response, (error as { statusCode?: number }).statusCode ?? 400, {
        error: error instanceof Error ? error.message : "Invalid JSON payload.",
      });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/runs") {
    try {
      const payload = await readJsonBody<
        {
          scenario?: unknown;
          scenarioId?: string;
          seed?: number;
          runId?: string;
        }
      >(request);
      let scenario = payload.scenario ?? defaultScenario();
      if (payload.scenarioId && payload.scenarioId !== "refund-approval") {
        throw new Error("Unknown scenario");
      }
      if (payload.seed !== undefined) {
        scenario = { ...(scenario as object), seed: payload.seed };
      }
      const runId = payload.runId ?? randomUUID();
      if (!RUN_ID_PATTERN.test(runId)) {
        sendJson(response, 400, { error: "Invalid run ID." });
        return;
      }
      if (experimentRuns.has(runId)) {
        sendJson(response, 409, { error: "Run ID already exists." });
        return;
      }
      const runner = new DeterministicSimulationRunner(scenario, runId);
      if (experimentRuns.size >= 100) {
        experimentRuns.delete(experimentRuns.keys().next().value as string);
      }
      experimentRuns.set(runId, runner);
      sendJson(response, 201, runner.start());
    } catch (error) {
      sendJson(response, (error as { statusCode?: number }).statusCode ?? 400, {
        error: error instanceof Error
          ? error.message
          : "Invalid scenario payload.",
      });
    }
    return;
  }

  const runMatch = pathname.match(
    /^\/api\/runs\/([^/]+)(?:\/(step|finish|events))?$/,
  );
  if (runMatch) {
    let runId: string;
    try {
      runId = decodeURIComponent(runMatch[1]);
    } catch {
      sendJson(response, 400, { error: "Invalid run ID." });
      return;
    }
    const runner = experimentRuns.get(runId);
    if (!runner) {
      sendJson(response, 404, { error: "Run not found." });
      return;
    }
    if (request.method === "GET" && !runMatch[2]) {
      sendJson(response, 200, runner.result());
      return;
    }
    if (request.method === "POST" && runMatch[2] === "step") {
      sendJson(response, 200, runner.step());
      return;
    }
    if (request.method === "POST" && runMatch[2] === "finish") {
      sendJson(response, 200, runner.finish());
      return;
    }
    if (request.method === "GET" && runMatch[2] === "events") {
      sendJson(response, 200, { runId, events: runner.getEvents() });
      return;
    }
  }
  if (request.method === "POST" && pathname === "/api/replay") {
    try {
      const payload = await readJsonBody<
        { scenario?: unknown; events?: RunResult["events"] }
      >(request);
      if (!payload.scenario || !payload.events) {
        throw new Error("scenario and events are required");
      }
      sendJson(response, 200, {
        state: replayScenario(payload.scenario, payload.events),
      });
    } catch (error) {
      sendJson(response, (error as { statusCode?: number }).statusCode ?? 400, {
        error: error instanceof Error
          ? error.message
          : "Invalid replay payload.",
      });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    response.write("\n");
    clients.add(response);

    const runtime = getLiveRuntime();
    const runtimeSnapshot = runtime.getStatusSnapshot();
    sendEvent(response, { type: "status", payload: runtimeSnapshot.status });
    for (const log of runtimeSnapshot.logs) {
      sendEvent(response, { type: "log", payload: log });
    }
    sendEvent(response, {
      type: "employees",
      payload: runtime.getEmployeeSnapshot(),
    });

    request.on("close", () => {
      clients.delete(response);
    });
    return;
  }

  const knownPath = pathname.startsWith("/api/") || pathname === "/events";
  sendJson(response, knownPath ? 405 : 404, {
    error: knownPath ? "Method not allowed." : "Not found.",
  });
}

export const server = http.createServer(handleApiRequest);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(
    PORT,
    HOST,
    () => console.log(`No Man's AI API listening on http://${HOST}:${PORT}`),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      liveRuntime?.shutdown();
      if (server.listening) server.close(() => process.exit(0));
    });
  }
}
