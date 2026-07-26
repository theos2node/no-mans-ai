import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import scenario from "../scenarios/refund-approval.json";
import {
  DeterministicSimulationRunner,
  projectPublicState,
} from "../src/simulation/runner.ts";
import { replayScenario } from "../src/simulation/replay.ts";
import { validateScenario } from "../src/simulation/model.ts";
import type { CanonicalEvent } from "../src/simulation/events.ts";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fullRun = (id = "stable-run") =>
  new DeterministicSimulationRunner(scenario, id).runToCompletion();
const resequence = (events: CanonicalEvent[]): CanonicalEvent[] => {
  events.forEach((event, index) => {
    event.sequence = index + 1;
  });
  return events;
};

describe("deterministic refund scenario", () => {
  it("produces identical events, state, metrics, and duration-derived metrics", () => {
    const first = fullRun();
    const second = fullRun();
    expect(second.events).toEqual(first.events);
    expect(second.state).toEqual(first.state);
    expect(second.metrics).toEqual(first.metrics);
    expect(first.metrics.completed).toBe(true);
    expect(first.metrics.movementTicks).toBeGreaterThan(0);
    expect(first.metrics.waitingTicks).toBe(1);
    expect(
      first.events.every((event) =>
        event.schemaVersion === 1 && event.runId === "stable-run" &&
        event.scenarioId === scenario.id && event.scenarioVersion === 1
      ),
    ).toBe(true);
  });

  it("replays the public final state and allows an in-progress stream", () => {
    const runner = new DeterministicSimulationRunner(scenario, "replay-run");
    const started = runner.start();
    expect(replayScenario(scenario, started.events)).toEqual(started.state);
    const result = runner.runToCompletion();
    expect(replayScenario(scenario, result.events)).toEqual(result.state);
    expect(projectPublicState(scenario, result.events)).toEqual(result.state);
  });

  it("strictly rejects invalid definitions, unknown fields, duplicate keys, and invalid causality", () => {
    expect(() => validateScenario({ ...scenario, version: 2 })).toThrow(
      /version/,
    );
    expect(() =>
      validateScenario({
        ...scenario,
        steps: [{ ...scenario.steps[0], action: "teleport" }],
      })
    ).toThrow(/unknown action/);
    expect(() =>
      validateScenario({
        ...scenario,
        employees: [{ id: "sam", locationId: "not-an-office" }],
      })
    ).toThrow(/unknown location/);
    expect(() =>
      validateScenario({
        ...scenario,
        goals: [{ id: "bad", type: "request", status: "maybe" }],
      })
    ).toThrow(/unknown request status/);
    expect(() =>
      validateScenario({
        ...scenario,
        employees: [
          { ...scenario.employees[0], id: "sam" },
          ...scenario.employees,
        ],
      })
    ).toThrow(/duplicate employee/);
    expect(() =>
      validateScenario({
        ...scenario,
        inbox: [{ ...scenario.inbox[0], extra: true }],
      })
    ).toThrow(/unknown field/);
    expect(() =>
      validateScenario({
        ...scenario,
        goals: [{ ...scenario.goals[0], actorId: "nobody" }],
      })
    ).toThrow(/unknown field/);
    expect(() =>
      validateScenario({
        ...scenario,
        steps: scenario.steps.map((step, index) =>
          index === 5 ? { ...step, requestKey: "missing-approval" } : step
        ),
      })
    ).toThrow(/unknown request/);
    expect(() =>
      validateScenario({
        ...scenario,
        steps: scenario.steps.map((step) =>
          step.id === "send-response"
            ? {
              ...step,
              inboxId: "email-duplicate-charge",
              requestKey: "refund-approval",
            }
            : step
        ),
      })
    ).not.toThrow();
  });

  it("satisfies approval, outgoing email, and archival goals without implicit record selection", () => {
    const result = fullRun("goal-run");
    expect(result.metrics.goals.every((goal) => goal.satisfied)).toBe(true);
    expect(result.metrics.approvals).toBe(1);
    expect(result.state.sentEmails[0]?.subject).toBe(
      "Refund approved for duplicate charge",
    );
    expect(result.state.inbox[0]?.archived).toBe(true);
    expect(
      result.events.find((event) => event.type === "item.archived")?.payload
        .inboxId,
    ).toBe("email-duplicate-charge");
  });
});

describe("replay rejection and lifecycle validation", () => {
  const altered = (change: (events: CanonicalEvent[]) => void) => {
    const events = clone(fullRun("replay-negative").events);
    change(events);
    return events;
  };
  it.each([
    ["wrong run identity", (events: CanonicalEvent[]) => {
      events[1].runId = "other-run";
    }],
    ["wrong scenario identity", (events: CanonicalEvent[]) => {
      events[0].scenarioId = "other-scenario";
    }],
    ["wrong seed", (events: CanonicalEvent[]) => {
      events[0].payload.seed = 1;
    }],
    ["backward tick", (events: CanonicalEvent[]) => {
      events[2].tick = 0;
    }],
    ["malformed payload", (events: CanonicalEvent[]) => {
      delete events[1].payload.locationId;
    }],
    ["duplicate start", (events: CanonicalEvent[]) => {
      events.splice(1, 0, clone(events[0]));
      events.forEach((event, index) => {
        event.sequence = index + 1;
      });
    }],
    ["event after finish", (events: CanonicalEvent[]) => {
      const finish = events.pop()!;
      const lateEvent = clone(events[1]);
      lateEvent.tick = finish.tick;
      events.push(finish, lateEvent);
      events.forEach((event, index) => {
        event.sequence = index + 1;
      });
    }],
    ["invalid actor", (events: CanonicalEvent[]) => {
      events[1].actorId = "nobody";
    }],
    ["invalid action", (events: CanonicalEvent[]) => {
      const event = events.find((item) => item.type === "action.completed")!;
      event.payload.action = "teleport";
    }],
  ])(
    "rejects %s",
    (_name, change) =>
      expect(() => replayScenario(scenario, altered(change))).toThrow(),
  );

  it("rejects early completed finish but accepts early incomplete finish", () => {
    const runner = new DeterministicSimulationRunner(scenario, "early-run");
    runner.start();
    runner.step();
    const incomplete = runner.finish();
    expect(incomplete.status).toBe("finished");
    expect(incomplete.metrics.completed).toBe(false);
    expect(() => replayScenario(scenario, incomplete.events)).not.toThrow();
    const events = clone(incomplete.events);
    events.at(-1)!.payload.completed = true;
    expect(() => replayScenario(scenario, events)).toThrow(/early finish/);
  });

  it("rejects invalid causal request, email, and archive sequences", () => {
    const result = fullRun("causal-run");
    const noApproval = resequence(
      result.events.filter((event) => event.type !== "request.approved"),
    );
    expect(() => replayScenario(scenario, noApproval)).toThrow();
    const noDraft = resequence(
      result.events.filter((event) =>
        !(event.type === "action.completed" &&
          event.payload.action === "draft_email")
      ),
    );
    expect(() => replayScenario(scenario, noDraft)).toThrow();
    const badArchive = clone(result.events);
    const archive = badArchive.find((event) => event.type === "item.archived")!;
    archive.payload.inboxId = "wrong-item";
    expect(() => replayScenario(scenario, badArchive)).toThrow();
  });
});

describe("experiment API integration", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) {
      const activeServer = server;
      activeServer.closeAllConnections();
      await new Promise<void>((resolve) => activeServer.close(() => resolve()));
    }
    server = undefined;
  });
  it("uses a real ephemeral http server for run lifecycle and replay", async ({ skip }) => {
    const { handleApiRequest } = await import("../src/api/server.ts");
    server = createServer(handleApiRequest);
    try {
      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(0, resolve);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        server = undefined;
        skip();
        return;
      }
      throw error;
    }
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("server did not bind");
    }
    const base = `http://127.0.0.1:${address.port}`;
    const request = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${base}${path}`, init);
      return { response, body: await response.json() as any };
    };
    const create = await request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioId: "refund-approval",
        runId: "api-integration-run",
      }),
    });
    expect(create.response.status).toBe(201);
    expect(create.body.status).toBe("running");
    const duplicate = await request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioId: "refund-approval",
        runId: "api-integration-run",
      }),
    });
    expect(duplicate.response.status).toBe(409);
    expect(
      (await request("/api/runs/api-integration-run/step", { method: "POST" }))
        .response.status,
    ).toBe(200);
    const finish = await request("/api/runs/api-integration-run/finish", {
      method: "POST",
    });
    expect(finish.response.status).toBe(200);
    const replay = await request("/api/replay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario, events: finish.body.events }),
    });
    expect(replay.response.status).toBe(200);
    expect(replay.body.state).toEqual(finish.body.state);
  });

  it("enforces IDs, body limits, method handling, and deterministic runtime isolation", async ({ skip }) => {
    const { handleApiRequest, isLiveRuntimeInitialized } = await import(
      "../src/api/server.ts"
    );
    expect(isLiveRuntimeInitialized()).toBe(false);
    server = createServer(handleApiRequest);
    try {
      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(0, resolve);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        server = undefined;
        skip();
        return;
      }
      throw error;
    }
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("server did not bind");
    }
    const base = `http://127.0.0.1:${address.port}`;
    const invalid = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: "bad id", scenarioId: "refund-approval" }),
    });
    expect(invalid.status).toBe(400);
    const tooLarge = await fetch(`${base}/api/replay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "x".repeat(256 * 1024) }),
    });
    expect(tooLarge.status).toBe(413);
    expect((await fetch(`${base}/api/health`, { method: "POST" })).status).toBe(
      405,
    );
    expect((await fetch(`${base}/not-a-route`)).status).toBe(404);
    const deterministic = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioId: "refund-approval",
        runId: "isolation-run",
      }),
    });
    expect(deterministic.status).toBe(201);
    expect(isLiveRuntimeInitialized()).toBe(false);
  });
});
