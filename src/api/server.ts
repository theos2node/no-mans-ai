import 'dotenv/config';

import http, { type IncomingMessage, type ServerResponse } from 'http';

import {
  createLivePlannerConfig,
  type ManualEmailPayload,
  OfficeSimulationEngine,
  type DashboardEvent,
  type EmployeeSyncPayload,
} from './simulationEngine.ts';

const PORT = Number(process.env.PORT ?? 8787);
const planner = createLivePlannerConfig();

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendEvent(response: ServerResponse, event: DashboardEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let body = '';

  for await (const chunk of request) {
    body += chunk.toString('utf8');
  }

  return JSON.parse(body || '{}') as T;
}

const runtime = new OfficeSimulationEngine({ planner });
const clients = new Set<ServerResponse>();
let shuttingDown = false;

runtime.subscribe((event) => {
  for (const client of clients) {
    sendEvent(client, event);
  }
});

const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const url = request.url ?? '/';

  if (request.method === 'GET' && url === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url === '/api/status') {
    sendJson(response, 200, runtime.getStatusSnapshot());
    return;
  }

  if (request.method === 'GET' && url === '/api/meta') {
    sendJson(response, 200, runtime.getRunnerMeta());
    return;
  }

  if (request.method === 'GET' && url === '/api/employees') {
    sendJson(response, 200, runtime.getEmployeeSnapshot());
    return;
  }

  if (request.method === 'POST' && url === '/api/start') {
    const result = runtime.start();
    sendJson(response, result.ok ? 200 : 409, result.ok ? runtime.getStatusSnapshot() : result);
    return;
  }

  if (request.method === 'POST' && url === '/api/stop') {
    const result = runtime.pause();
    sendJson(response, result.ok ? 200 : 409, result.ok ? runtime.getStatusSnapshot() : result);
    return;
  }

  if (request.method === 'POST' && url === '/api/reset') {
    sendJson(response, 200, runtime.reset());
    return;
  }

  if (request.method === 'POST' && url === '/api/test') {
    sendJson(response, 200, runtime.runTest());
    return;
  }

  if (request.method === 'POST' && url === '/api/employees/sync') {
    try {
      const payload = await readJsonBody<EmployeeSyncPayload>(request);
      if (!Array.isArray(payload.employees)) {
        sendJson(response, 400, { error: 'Invalid employees payload.' });
        return;
      }

      sendJson(response, 200, runtime.syncEmployees(payload));
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON payload.' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/emails/send') {
    try {
      const payload = await readJsonBody<ManualEmailPayload>(request);
      const result = runtime.sendManualEmail(payload);
      sendJson(response, result.ok ? 200 : 400, result);
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON payload.' });
    }
    return;
  }

  if (request.method === 'GET' && url === '/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    response.write('\n');
    clients.add(response);

    const runtimeSnapshot = runtime.getStatusSnapshot();
    sendEvent(response, { type: 'status', payload: runtimeSnapshot.status });
    for (const log of runtimeSnapshot.logs) {
      sendEvent(response, { type: 'log', payload: log });
    }
    sendEvent(response, { type: 'employees', payload: runtime.getEmployeeSnapshot() });

    request.on('close', () => {
      clients.delete(response);
    });
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`No Man's AI API listening on http://localhost:${PORT}`);
});

function shutdownServer(exitCode: number) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  runtime.shutdown();
  server.close(() => process.exit(exitCode));
  setTimeout(() => process.exit(exitCode), 1_000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdownServer(0);
  });
}

process.on('uncaughtException', (error) => {
  console.error('No Man\'s AI API uncaught exception:', error);
  shutdownServer(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('No Man\'s AI API unhandled rejection:', reason);
  shutdownServer(1);
});
