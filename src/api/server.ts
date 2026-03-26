import 'dotenv/config';

import http, { type IncomingMessage, type ServerResponse } from 'http';

type RunState = 'idle' | 'running' | 'paused';

type EmployeeId =
  | 'sam'
  | 'jeremy'
  | 'ava-react-a'
  | 'milo-react-b'
  | 'nia-customer-service'
  | 'ellis-accounting'
  | 'rowan-manager'
  | 'petra-quality'
  | 'june-terminal';

interface DashboardStatus {
  state: RunState;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  pid: number | null;
}

interface DashboardEvent {
  type: 'status' | 'log' | 'clear' | 'employees';
  payload: unknown;
}

interface LogEntry {
  timestamp: string;
  source: 'system';
  line: string;
}

interface RunnerMeta {
  live: boolean;
}

interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface EmployeeSeed {
  id: EmployeeId;
  name: string;
  position: string;
  assignedLocationId: string;
  bio: string;
  defaultTaskTitle: string;
  defaultChecklist: string[];
}

interface EmployeeRuntimeState extends EmployeeSeed {
  currentLocationId: string;
  status: string;
  taskTitle: string;
  checklist: string[];
  scriptQueue: string[];
  lastUpdatedAt: string;
}

interface EmployeeSnapshot {
  mode: 'live' | 'local';
  employees: EmployeeRuntimeState[];
  usage: UsageSnapshot;
}

interface EmployeeSyncEntry {
  id: EmployeeId;
  currentLocationId: string;
  status: string;
  taskTitle: string;
  checklist: string[];
}

interface EmployeeSyncPayload {
  employees: EmployeeSyncEntry[];
}

const PORT = Number(process.env.PORT ?? 8787);
const MAX_LOG_ENTRIES = 200;
const TEST_SCRIPT_LENGTH = 6;
const META: RunnerMeta = {
  live: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
};

const officeLocationIds = [
  'break-room',
  'react-a',
  'react-b',
  'react-c',
  'react-d',
  'customer-service',
  'accounting',
  'it-support',
  'red-terminal',
  'archives',
  'quality-inspector',
  'general-manager',
] as const;

const employeeSeeds: EmployeeSeed[] = [
  {
    id: 'sam',
    name: 'Sam',
    position: 'React C',
    assignedLocationId: 'react-c',
    bio: 'Steady and patient, Sam keeps the front-end work calm and organized.',
    defaultTaskTitle: 'React C',
    defaultChecklist: ['Check queue', 'Review task board', 'Pair on front-end fix'],
  },
  {
    id: 'jeremy',
    name: 'Jeremy',
    position: 'React D',
    assignedLocationId: 'react-d',
    bio: 'Direct and reliable, Jeremy likes quick fixes that remove blockers fast.',
    defaultTaskTitle: 'React D',
    defaultChecklist: ['Check queue', 'Review blocker list', 'Pair on UI pass'],
  },
  {
    id: 'ava-react-a',
    name: 'Ava Kim',
    position: 'React A',
    assignedLocationId: 'react-a',
    bio: 'A quiet prototyper who likes clean interactions and stable systems.',
    defaultTaskTitle: 'React A',
    defaultChecklist: ['Review branch', 'Tighten component states', 'Leave handoff notes'],
  },
  {
    id: 'milo-react-b',
    name: 'Milo Perez',
    position: 'React B',
    assignedLocationId: 'react-b',
    bio: 'Fast-moving and energetic, usually the first one to volunteer for UI polish.',
    defaultTaskTitle: 'React B',
    defaultChecklist: ['Sweep UI issues', 'Validate motion pass', 'Report blockers'],
  },
  {
    id: 'nia-customer-service',
    name: 'Nia Solis',
    position: 'Customer Service',
    assignedLocationId: 'customer-service',
    bio: 'Warm, observant, and hard to rattle, with a strong memory for people.',
    defaultTaskTitle: 'Service',
    defaultChecklist: ['Review inbox', 'Confirm bookings', 'Escalate exceptions'],
  },
  {
    id: 'ellis-accounting',
    name: 'Ellis Hart',
    position: 'Accounting',
    assignedLocationId: 'accounting',
    bio: 'Methodical and dry-humored, Ellis notices bad numbers immediately.',
    defaultTaskTitle: 'Accounting',
    defaultChecklist: ['Review ledger', 'Confirm payments', 'Flag mismatches'],
  },
  {
    id: 'rowan-manager',
    name: 'Rowan Pike',
    position: 'General Manager',
    assignedLocationId: 'general-manager',
    bio: 'Decisive and composed, Rowan keeps the office moving without over-talking.',
    defaultTaskTitle: 'Manager',
    defaultChecklist: ['Check team flow', 'Review escalations', 'Approve priorities'],
  },
  {
    id: 'petra-quality',
    name: 'Petra Vale',
    position: 'Quality Inspector',
    assignedLocationId: 'quality-inspector',
    bio: 'Exacting and sharp-eyed, Petra spots tiny breakages before anyone else.',
    defaultTaskTitle: 'Quality',
    defaultChecklist: ['Inspect output', 'Log defects', 'Push fixes back upstream'],
  },
  {
    id: 'june-terminal',
    name: 'June Mercer',
    position: 'IT Support',
    assignedLocationId: 'it-support',
    bio: 'Quick on diagnostics and calm under pressure, June handles office support without drama.',
    defaultTaskTitle: 'IT',
    defaultChecklist: ['Check terminal health', 'Review support queue', 'Resolve office issues'],
  },
];

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

function pickRandomDestination(excluding: Set<string>) {
  const candidates = officeLocationIds.filter((locationId) => !excluding.has(locationId));
  const pool = candidates.length > 0 ? candidates : officeLocationIds;
  return pool[Math.floor(Math.random() * pool.length)] ?? officeLocationIds[0];
}

function buildScriptQueue(currentLocationId: string) {
  const queue: string[] = [];
  let previous = currentLocationId;

  for (let index = 0; index < TEST_SCRIPT_LENGTH; index += 1) {
    const choice = pickRandomDestination(new Set([previous]));
    queue.push(choice);
    previous = choice;
  }

  return queue;
}

function buildChecklist(seed: EmployeeSeed, destinationId: string) {
  return [
    `Move to ${destinationId}`,
    `Work ${seed.position}`,
    `Report from ${destinationId}`,
  ];
}

function createEmployeeState(seed: EmployeeSeed): EmployeeRuntimeState {
  return {
    ...seed,
    currentLocationId: seed.assignedLocationId,
    status: `Holding at ${seed.position}`,
    taskTitle: seed.defaultTaskTitle,
    checklist: [...seed.defaultChecklist],
    scriptQueue: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

class RuntimeBridge {
  private readonly listeners = new Set<(event: DashboardEvent) => void>();
  private logs: LogEntry[] = [];
  private status: DashboardStatus = {
    state: 'idle',
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    pid: null,
  };
  private readonly employees = new Map(employeeSeeds.map((seed) => [seed.id, createEmployeeState(seed)] as const));
  private usage: UsageSnapshot = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  getRuntimeSnapshot(): { status: DashboardStatus; logs: LogEntry[] } {
    return {
      status: { ...this.status },
      logs: [...this.logs],
    };
  }

  getEmployeeSnapshot(): EmployeeSnapshot {
    return {
      mode: META.live ? 'live' : 'local',
      employees: [...this.employees.values()].map((employee) => ({
        ...employee,
        checklist: [...employee.checklist],
        scriptQueue: [...employee.scriptQueue],
      })),
      usage: { ...this.usage },
    };
  }

  subscribe(listener: (event: DashboardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): { ok: boolean; error?: string } {
    if (this.status.state === 'running') {
      return { ok: false, error: 'Runtime is already running.' };
    }

    if (this.status.state === 'idle') {
      this.logs = [];
      this.broadcast({ type: 'clear', payload: null });
      this.status.startedAt = new Date().toISOString();
    }

    this.status = {
      ...this.status,
      state: 'running',
      finishedAt: null,
      exitCode: null,
      signal: null,
      pid: null,
    };

    for (const employee of this.employees.values()) {
      employee.status = META.live ? `Live logic armed for ${employee.position}` : `Local logic armed for ${employee.position}`;
      employee.lastUpdatedAt = new Date().toISOString();
    }

    this.pushSystemLog(
      META.live
        ? 'Live runtime marked running. Frontend actions may use real tokens.'
        : 'Local runtime marked running. Frontend stays in scripted test mode.',
    );
    this.broadcast({ type: 'status', payload: this.status });
    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    return { ok: true };
  }

  stop(): { ok: boolean; error?: string } {
    if (this.status.state !== 'running') {
      return { ok: false, error: 'Runtime is not currently running.' };
    }

    this.status = {
      ...this.status,
      state: 'paused',
      finishedAt: new Date().toISOString(),
    };

    for (const employee of this.employees.values()) {
      employee.status = `Paused at ${employee.currentLocationId}`;
      employee.lastUpdatedAt = new Date().toISOString();
    }

    this.pushSystemLog('Runtime paused by operator.');
    this.broadcast({ type: 'status', payload: this.status });
    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    return { ok: true };
  }

  runTest(): EmployeeSnapshot {
    for (const employee of this.employees.values()) {
      const queue = buildScriptQueue(employee.currentLocationId);
      const firstDestination = queue[0] ?? employee.assignedLocationId;

      employee.scriptQueue = queue;
      employee.taskTitle = employee.defaultTaskTitle;
      employee.checklist = buildChecklist(employee, firstDestination);
      employee.status = `Walking to ${firstDestination}`;
      employee.lastUpdatedAt = new Date().toISOString();
    }

    this.pushSystemLog('Generated scripted test routes for the full office roster.');
    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    return this.getEmployeeSnapshot();
  }

  syncEmployees(payload: EmployeeSyncPayload): EmployeeSnapshot {
    for (const entry of payload.employees) {
      const employee = this.employees.get(entry.id);
      if (!employee) {
        continue;
      }

      employee.currentLocationId = entry.currentLocationId;
      employee.status = entry.status;
      employee.taskTitle = entry.taskTitle;
      employee.checklist = [...entry.checklist];
      employee.lastUpdatedAt = new Date().toISOString();
    }

    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    return this.getEmployeeSnapshot();
  }

  shutdown(): void {
    this.status = {
      ...this.status,
      state: this.status.state === 'running' ? 'paused' : this.status.state,
    };
  }

  private broadcast(event: DashboardEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private pushSystemLog(line: string): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      source: 'system',
      line,
    });

    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(-MAX_LOG_ENTRIES);
    }

    this.broadcast({
      type: 'log',
      payload: this.logs[this.logs.length - 1],
    });
  }
}

const runtime = new RuntimeBridge();
const clients = new Set<ServerResponse>();

runtime.subscribe((event) => {
  for (const client of clients) {
    sendEvent(client, event);
  }
});

const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
  const url = request.url ?? '/';

  if (request.method === 'GET' && url === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url === '/api/status') {
    sendJson(response, 200, runtime.getRuntimeSnapshot());
    return;
  }

  if (request.method === 'GET' && url === '/api/meta') {
    sendJson(response, 200, META);
    return;
  }

  if (request.method === 'GET' && url === '/api/employees') {
    sendJson(response, 200, runtime.getEmployeeSnapshot());
    return;
  }

  if (request.method === 'POST' && url === '/api/start') {
    const result = runtime.start();
    sendJson(response, result.ok ? 200 : 409, result.ok ? runtime.getRuntimeSnapshot() : result);
    return;
  }

  if (request.method === 'POST' && url === '/api/stop') {
    const result = runtime.stop();
    sendJson(response, result.ok ? 200 : 409, result.ok ? runtime.getRuntimeSnapshot() : result);
    return;
  }

  if (request.method === 'POST' && url === '/api/test') {
    sendJson(response, 200, runtime.runTest());
    return;
  }

  if (request.method === 'POST' && url === '/api/employees/sync') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}') as EmployeeSyncPayload;
        if (!Array.isArray(payload.employees)) {
          sendJson(response, 400, { error: 'Invalid employees payload.' });
          return;
        }

        sendJson(response, 200, runtime.syncEmployees(payload));
      } catch {
        sendJson(response, 400, { error: 'Invalid JSON payload.' });
      }
    });
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

    const runtimeSnapshot = runtime.getRuntimeSnapshot();
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    runtime.shutdown();
    server.close(() => process.exit(0));
  });
}
