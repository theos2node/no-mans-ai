import { randomUUID } from 'node:crypto';

export type RunState = 'idle' | 'running' | 'paused';

export type EmployeeId =
  | 'sam'
  | 'jeremy'
  | 'ava-react-a'
  | 'milo-react-b'
  | 'nia-customer-service'
  | 'ellis-accounting'
  | 'rowan-manager'
  | 'petra-quality'
  | 'june-terminal';

export type OfficeLocationId =
  | 'break-room'
  | 'react-a'
  | 'react-b'
  | 'react-c'
  | 'react-d'
  | 'customer-service'
  | 'accounting'
  | 'it-support'
  | 'red-terminal'
  | 'archives'
  | 'quality-inspector'
  | 'general-manager';

export type EmployeePhase = 'idle' | 'moving' | 'working' | 'paused';
export type PlannerTransport = 'local' | 'direct' | 'proxy';

export interface DashboardStatus {
  state: RunState;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  pid: number | null;
}

export interface DashboardEvent {
  type: 'status' | 'log' | 'clear' | 'employees';
  payload: unknown;
}

export interface LogEntry {
  timestamp: string;
  source: 'system';
  line: string;
}

export interface RunnerMeta {
  live: boolean;
  transport: PlannerTransport;
  model: string | null;
}

export interface UsageSnapshot {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface EmployeeSeed {
  id: EmployeeId;
  name: string;
  position: string;
  assignedLocationId: OfficeLocationId;
  bio: string;
  defaultTaskTitle: string;
  defaultChecklist: string[];
}

interface ChecklistStep {
  label: string;
  done: boolean;
}

interface PlanStop {
  locationId: OfficeLocationId;
  stepLabel: string;
}

interface TaskPlan {
  id: string;
  title: string;
  stops: PlanStop[];
}

export interface LivePlannerConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  transport: Exclude<PlannerTransport, 'local'>;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface ModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface PlannerChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface LivePlanPayload {
  title: string;
  stops: PlanStop[];
}

interface EmployeeRuntimeRecord extends EmployeeSeed {
  currentLocationId: OfficeLocationId;
  targetLocationId: OfficeLocationId | null;
  phase: EmployeePhase;
  taskTitle: string;
  checklist: ChecklistStep[];
  status: string;
  currentPlan: TaskPlan | null;
  currentStopIndex: number;
  planVersion: number;
  lastUpdatedAt: string;
  planning: boolean;
  plannerRequestToken: number;
}

export interface EmployeeRuntimeState extends EmployeeSeed {
  currentLocationId: OfficeLocationId;
  targetLocationId: OfficeLocationId | null;
  phase: EmployeePhase;
  status: string;
  taskTitle: string;
  checklist: string[];
  scriptQueue: OfficeLocationId[];
  planVersion: number;
  lastUpdatedAt: string;
  planning: boolean;
}

export interface EmployeeSnapshot {
  mode: 'live' | 'local';
  tick: number;
  employees: EmployeeRuntimeState[];
  usage: UsageSnapshot;
}

export interface EmployeeSyncEntry {
  id: EmployeeId;
  currentLocationId: OfficeLocationId;
}

export interface EmployeeSyncPayload {
  employees: EmployeeSyncEntry[];
}

const ENGINE_TICK_MS = 2200;
const MAX_LOG_ENTRIES = 240;
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5-nano';
const PLANNER_MAX_TOKENS = 260;
const PLANNER_TEMPERATURE = 0.7;

const MODEL_PRICING_TABLE: Array<{ match: RegExp; pricing: ModelPricing }> = [
  { match: /^gpt-5(?:\.\d+)?$/i, pricing: { inputCostPer1M: 1.25, outputCostPer1M: 10 } },
  { match: /^gpt-5-mini$/i, pricing: { inputCostPer1M: 0.25, outputCostPer1M: 2 } },
  { match: /^gpt-5-nano$/i, pricing: { inputCostPer1M: 0.05, outputCostPer1M: 0.4 } },
  { match: /^gpt-4o-mini$/i, pricing: { inputCostPer1M: 0.15, outputCostPer1M: 0.6 } },
];

export const officeLocationIds: OfficeLocationId[] = [
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
];

const officeLocationIdSet = new Set<OfficeLocationId>(officeLocationIds);

const officeLocationLabels: Record<OfficeLocationId, string> = {
  'break-room': 'Break Room',
  'react-a': 'React A',
  'react-b': 'React B',
  'react-c': 'React C',
  'react-d': 'React D',
  'customer-service': 'Customer Service',
  accounting: 'Accounting',
  'it-support': 'IT Support',
  'red-terminal': 'Red Terminal',
  archives: 'Archives',
  'quality-inspector': 'Quality Inspector',
  'general-manager': 'General Manager',
};

export const employeeSeeds: EmployeeSeed[] = [
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

function nowIso() {
  return new Date().toISOString();
}

function locationLabel(locationId: OfficeLocationId) {
  return officeLocationLabels[locationId] ?? locationId;
}

function serializeChecklist(checklist: ChecklistStep[]) {
  return checklist.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.label}`);
}

function buildPlan(title: string, stops: PlanStop[]): TaskPlan {
  return {
    id: randomUUID(),
    title,
    stops,
  };
}

function createEmployeeState(seed: EmployeeSeed): EmployeeRuntimeRecord {
  return {
    ...seed,
    currentLocationId: seed.assignedLocationId,
    targetLocationId: null,
    phase: 'idle',
    taskTitle: seed.defaultTaskTitle,
    checklist: seed.defaultChecklist.map((label) => ({ label, done: false })),
    status: `Holding at ${seed.position}`,
    currentPlan: null,
    currentStopIndex: 0,
    planVersion: 0,
    lastUpdatedAt: nowIso(),
    planning: false,
    plannerRequestToken: 0,
  };
}

function randomFrom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function trimmedEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBaseUrl(baseUrl: string | null) {
  return (baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
}

function buildChatCompletionsUrl(baseUrl: string) {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

function defaultPricingForModel(model: string): ModelPricing {
  const match = MODEL_PRICING_TABLE.find((entry) => entry.match.test(model));
  return match?.pricing ?? { inputCostPer1M: 0, outputCostPer1M: 0 };
}

function parseUsdRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function inferTransport(baseUrl: string) {
  return /api\.openai\.com/i.test(baseUrl) ? 'direct' : 'proxy';
}

function shortError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

function extractAssistantText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('Planner response did not contain JSON.');
    }
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as unknown;
  }
}

function sanitizeLivePlanPayload(payload: unknown, fallbackLocationId: OfficeLocationId): LivePlanPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { title?: unknown; stops?: unknown };
  const title = typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : 'Live Plan';

  if (!Array.isArray(candidate.stops)) {
    return null;
  }

  const stops = candidate.stops
    .map((stop) => {
      if (!stop || typeof stop !== 'object') {
        return null;
      }

      const parsedStop = stop as { locationId?: unknown; stepLabel?: unknown };
      if (typeof parsedStop.locationId !== 'string' || !officeLocationIdSet.has(parsedStop.locationId as OfficeLocationId)) {
        return null;
      }

      const stepLabel = typeof parsedStop.stepLabel === 'string' && parsedStop.stepLabel.trim() ? parsedStop.stepLabel.trim() : null;
      if (!stepLabel) {
        return null;
      }

      return {
        locationId: parsedStop.locationId as OfficeLocationId,
        stepLabel,
      };
    })
    .filter((stop): stop is PlanStop => Boolean(stop))
    .slice(0, 3);

  if (stops.length === 0) {
    return {
      title,
      stops: [
        {
          locationId: fallbackLocationId,
          stepLabel: 'Review queue',
        },
      ],
    };
  }

  return { title, stops };
}

function readUsageTotals(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const usage = payload as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
  };

  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);

  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(0, totalTokens) : 0,
  };
}

function estimateCostUsd(usage: Pick<UsageSnapshot, 'inputTokens' | 'outputTokens'>, planner: LivePlannerConfig | null) {
  if (!planner) {
    return 0;
  }

  const estimatedCost =
    usage.inputTokens * (planner.inputCostPer1M / 1_000_000) +
    usage.outputTokens * (planner.outputCostPer1M / 1_000_000);

  return Number(estimatedCost.toFixed(6));
}

export function createLivePlannerConfig(env: NodeJS.ProcessEnv = process.env): LivePlannerConfig | null {
  const apiKey = trimmedEnvValue(env.OPENAI_API_KEY);
  if (!apiKey) {
    return null;
  }

  const model = trimmedEnvValue(env.OPENAI_MODEL) ?? trimmedEnvValue(env.TEST_LAN_PROXY_MODEL) ?? DEFAULT_OPENAI_MODEL;
  const baseUrl = normalizeBaseUrl(trimmedEnvValue(env.OPENAI_BASE_URL));
  const defaults = defaultPricingForModel(model);

  return {
    apiKey,
    baseUrl,
    model,
    transport: inferTransport(baseUrl),
    inputCostPer1M: parseUsdRate(env.OPENAI_INPUT_COST_PER_1M, defaults.inputCostPer1M),
    outputCostPer1M: parseUsdRate(env.OPENAI_OUTPUT_COST_PER_1M, defaults.outputCostPer1M),
  };
}

export function createRunnerMeta(planner: LivePlannerConfig | null): RunnerMeta {
  return {
    live: Boolean(planner),
    transport: planner?.transport ?? 'local',
    model: planner?.model ?? null,
  };
}

function defaultPlansFor(seed: EmployeeSeed): TaskPlan[] {
  switch (seed.position) {
    case 'React A':
    case 'React B':
    case 'React C':
    case 'React D':
      return [
        buildPlan('Feature Pass', [
          { locationId: seed.assignedLocationId, stepLabel: 'Review assigned ticket' },
          { locationId: seed.assignedLocationId, stepLabel: 'Patch interface flow' },
          { locationId: 'quality-inspector', stepLabel: 'Hand off for QA review' },
        ]),
        buildPlan('Support Sweep', [
          { locationId: 'customer-service', stepLabel: 'Review user-facing issue' },
          { locationId: seed.assignedLocationId, stepLabel: 'Apply front-end fix' },
          { locationId: 'general-manager', stepLabel: 'Report delivery status' },
        ]),
        buildPlan('Archive Polish', [
          { locationId: 'archives', stepLabel: 'Pull previous reference notes' },
          { locationId: seed.assignedLocationId, stepLabel: 'Refine component pass' },
          { locationId: 'break-room', stepLabel: 'Post handoff summary' },
        ]),
      ];

    case 'Customer Service':
      return [
        buildPlan('Booking Sweep', [
          { locationId: 'customer-service', stepLabel: 'Review inbox queue' },
          { locationId: 'customer-service', stepLabel: 'Confirm booking details' },
          { locationId: 'red-terminal', stepLabel: 'Escalate edge-case booking' },
        ]),
        buildPlan('Follow-up Loop', [
          { locationId: 'customer-service', stepLabel: 'Send customer follow-up' },
          { locationId: 'archives', stepLabel: 'Archive resolved thread' },
          { locationId: 'break-room', stepLabel: 'Reset for next response block' },
        ]),
      ];

    case 'Accounting':
      return [
        buildPlan('Ledger Audit', [
          { locationId: 'accounting', stepLabel: 'Review ledger changes' },
          { locationId: 'accounting', stepLabel: 'Match invoices to payments' },
          { locationId: 'general-manager', stepLabel: 'Report discrepancies' },
        ]),
        buildPlan('Payment Packet', [
          { locationId: 'accounting', stepLabel: 'Prepare payment packet' },
          { locationId: 'archives', stepLabel: 'Store reconciled records' },
          { locationId: 'red-terminal', stepLabel: 'Escalate approval threshold' },
        ]),
      ];

    case 'General Manager':
      return [
        buildPlan('Floor Review', [
          { locationId: 'general-manager', stepLabel: 'Review office priorities' },
          { locationId: 'react-c', stepLabel: 'Check implementation progress' },
          { locationId: 'quality-inspector', stepLabel: 'Confirm review cadence' },
        ]),
        buildPlan('Approvals', [
          { locationId: 'general-manager', stepLabel: 'Scan approval queue' },
          { locationId: 'accounting', stepLabel: 'Review budget impact' },
          { locationId: 'archives', stepLabel: 'Lock final decision record' },
        ]),
      ];

    case 'Quality Inspector':
      return [
        buildPlan('Quality Sweep', [
          { locationId: 'quality-inspector', stepLabel: 'Inspect incoming work' },
          { locationId: 'react-a', stepLabel: 'Report defects to React A' },
          { locationId: 'react-b', stepLabel: 'Validate revision request' },
        ]),
        buildPlan('Regression Check', [
          { locationId: 'quality-inspector', stepLabel: 'Review latest patch queue' },
          { locationId: 'react-c', stepLabel: 'Confirm fixed behavior' },
          { locationId: 'react-d', stepLabel: 'Sign off on UI regression pass' },
        ]),
      ];

    case 'IT Support':
      return [
        buildPlan('Terminal Health', [
          { locationId: 'it-support', stepLabel: 'Review support board' },
          { locationId: 'red-terminal', stepLabel: 'Check terminal connectivity' },
          { locationId: 'it-support', stepLabel: 'Close support ticket' },
        ]),
        buildPlan('Desk Sweep', [
          { locationId: 'react-a', stepLabel: 'Check workstation issue' },
          { locationId: 'react-b', stepLabel: 'Apply quick desktop fix' },
          { locationId: 'customer-service', stepLabel: 'Verify support follow-up' },
        ]),
      ];

    default:
      return [
        buildPlan(seed.defaultTaskTitle, [
          { locationId: seed.assignedLocationId, stepLabel: seed.defaultChecklist[0] ?? 'Review work queue' },
          { locationId: seed.assignedLocationId, stepLabel: seed.defaultChecklist[1] ?? 'Complete assigned work' },
          { locationId: 'archives', stepLabel: seed.defaultChecklist[2] ?? 'Record completion notes' },
        ]),
      ];
  }
}

function buildRandomTestPlan(seed: EmployeeSeed): TaskPlan {
  const first = randomFrom(officeLocationIds);
  const second = randomFrom(officeLocationIds.filter((locationId) => locationId !== first));
  const third = randomFrom(officeLocationIds.filter((locationId) => locationId !== first && locationId !== second));

  return buildPlan(`Test ${seed.defaultTaskTitle}`, [
    { locationId: first, stepLabel: `Move to ${locationLabel(first)}` },
    { locationId: second, stepLabel: `Validate path through ${locationLabel(second)}` },
    { locationId: third, stepLabel: `Report test result from ${locationLabel(third)}` },
  ]);
}

export class OfficeSimulationEngine {
  private readonly listeners = new Set<(event: DashboardEvent) => void>();
  private readonly employees = new Map(employeeSeeds.map((seed) => [seed.id, createEmployeeState(seed)] as const));
  private readonly planner: LivePlannerConfig | null;
  private readonly meta: RunnerMeta;
  private interval: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private logs: LogEntry[] = [];
  private usage: UsageSnapshot = {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
  private status: DashboardStatus = {
    state: 'idle',
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    pid: null,
  };

  constructor(options?: { planner?: LivePlannerConfig | null }) {
    this.planner = options?.planner ?? null;
    this.meta = createRunnerMeta(this.planner);
  }

  getRunnerMeta(): RunnerMeta {
    return { ...this.meta };
  }

  subscribe(listener: (event: DashboardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatusSnapshot(): { status: DashboardStatus; logs: LogEntry[] } {
    return {
      status: { ...this.status },
      logs: [...this.logs],
    };
  }

  getEmployeeSnapshot(): EmployeeSnapshot {
    return {
      mode: this.meta.live ? 'live' : 'local',
      tick: this.tickCount,
      employees: [...this.employees.values()].map((employee) => ({
        id: employee.id,
        name: employee.name,
        position: employee.position,
        assignedLocationId: employee.assignedLocationId,
        bio: employee.bio,
        defaultTaskTitle: employee.defaultTaskTitle,
        defaultChecklist: [...employee.defaultChecklist],
        currentLocationId: employee.currentLocationId,
        targetLocationId: employee.targetLocationId,
        phase: employee.phase,
        status: employee.status,
        taskTitle: employee.taskTitle,
        checklist: serializeChecklist(employee.checklist),
        scriptQueue: employee.targetLocationId ? [employee.targetLocationId] : [],
        planVersion: employee.planVersion,
        lastUpdatedAt: employee.lastUpdatedAt,
        planning: employee.planning,
      })),
      usage: { ...this.usage },
    };
  }

  start(): { ok: boolean; error?: string } {
    if (this.status.state === 'running') {
      return { ok: false, error: 'Runtime is already running.' };
    }

    if (this.status.state === 'idle') {
      this.logs = [];
      this.broadcast({ type: 'clear', payload: null });
      this.status.startedAt = nowIso();
    }

    this.status = {
      ...this.status,
      state: 'running',
      finishedAt: null,
      exitCode: null,
      signal: null,
    };

    for (const employee of this.employees.values()) {
      if (employee.phase === 'paused') {
        employee.phase = employee.targetLocationId ? 'moving' : employee.currentPlan ? 'working' : 'idle';
      }
      this.refreshStatus(employee);
    }

    this.ensureInterval();
    this.tick();
    this.pushSystemLog(
      this.meta.live
        ? `${this.meta.transport === 'proxy' ? 'Proxy' : 'Direct'} office simulation started on ${this.meta.model ?? DEFAULT_OPENAI_MODEL}.`
        : 'Local office simulation started. Employees are running scripted backend logic.',
    );
    this.broadcast({ type: 'status', payload: this.status });
    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    return { ok: true };
  }

  pause(): { ok: boolean; error?: string } {
    if (this.status.state !== 'running') {
      return { ok: false, error: 'Runtime is not currently running.' };
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.status = {
      ...this.status,
      state: 'paused',
      finishedAt: nowIso(),
    };

    for (const employee of this.employees.values()) {
      employee.planning = false;
      employee.plannerRequestToken += 1;
      employee.phase = 'paused';
      employee.status = `Paused at ${locationLabel(employee.currentLocationId)}`;
      employee.lastUpdatedAt = nowIso();
    }

    this.pushSystemLog('Runtime paused by operator.');
    this.broadcast({ type: 'status', payload: this.status });
    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    return { ok: true };
  }

  reset(): EmployeeSnapshot {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.tickCount = 0;
    this.status = {
      state: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      signal: null,
      pid: null,
    };
    this.usage = {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    this.employees.clear();
    for (const seed of employeeSeeds) {
      this.employees.set(seed.id, createEmployeeState(seed));
    }

    this.pushSystemLog('Simulation reset to the default office roster.');
    this.broadcast({ type: 'status', payload: this.status });
    const snapshot = this.getEmployeeSnapshot();
    this.broadcast({ type: 'employees', payload: snapshot });
    return snapshot;
  }

  runTest(): EmployeeSnapshot {
    this.status = {
      ...this.status,
      state: 'running',
      startedAt: this.status.startedAt ?? nowIso(),
      finishedAt: null,
    };
    this.ensureInterval();

    for (const employee of this.employees.values()) {
      employee.planning = false;
      employee.plannerRequestToken += 1;
      this.applyPlan(employee, buildRandomTestPlan(employee), true);
    }

    this.pushSystemLog('Generated scripted backend test plans for the full office roster.');
    this.broadcast({ type: 'status', payload: this.status });
    const snapshot = this.getEmployeeSnapshot();
    this.broadcast({ type: 'employees', payload: snapshot });
    return snapshot;
  }

  syncEmployees(payload: EmployeeSyncPayload): EmployeeSnapshot {
    for (const entry of payload.employees) {
      const employee = this.employees.get(entry.id);
      if (!employee) {
        continue;
      }

      employee.currentLocationId = entry.currentLocationId;
      employee.lastUpdatedAt = nowIso();

      if (employee.phase === 'moving' && employee.targetLocationId === entry.currentLocationId) {
        employee.phase = 'working';
        employee.status = `Working ${employee.taskTitle} at ${locationLabel(entry.currentLocationId)}`;
        employee.planVersion += 1;
        this.pushSystemLog(`${employee.name} arrived at ${locationLabel(entry.currentLocationId)} for ${employee.taskTitle}.`);
      }
    }

    const snapshot = this.getEmployeeSnapshot();
    this.broadcast({ type: 'employees', payload: snapshot });
    return snapshot;
  }

  shutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private ensureInterval() {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      this.tick();
    }, ENGINE_TICK_MS);
  }

  private tick() {
    if (this.status.state !== 'running') {
      return;
    }

    this.tickCount += 1;

    for (const employee of this.employees.values()) {
      this.advanceEmployee(employee);
    }

    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
  }

  private advanceEmployee(employee: EmployeeRuntimeRecord) {
    if (employee.phase === 'moving') {
      employee.status = `Walking to ${locationLabel(employee.targetLocationId ?? employee.currentLocationId)}`;
      return;
    }

    if (employee.phase === 'working') {
      this.advanceWork(employee);
      return;
    }

    if (employee.phase !== 'idle') {
      return;
    }

    if (employee.planning) {
      employee.status = `Waiting for ${this.meta.transport === 'proxy' ? 'proxy' : 'live'} plan`;
      return;
    }

    if (this.planner) {
      void this.requestLivePlan(employee.id);
      return;
    }

    const plans = defaultPlansFor(employee);
    this.applyPlan(employee, randomFrom(plans), false);
  }

  private advanceWork(employee: EmployeeRuntimeRecord) {
    if (!employee.currentPlan) {
      employee.phase = 'idle';
      employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
      employee.lastUpdatedAt = nowIso();
      return;
    }

    const currentStep = employee.checklist[employee.currentStopIndex];
    if (!currentStep) {
      this.completePlan(employee);
      return;
    }

    if (!currentStep.done) {
      currentStep.done = true;
      employee.status = `Working ${employee.taskTitle} at ${locationLabel(employee.currentLocationId)}`;
      employee.lastUpdatedAt = nowIso();
      this.pushSystemLog(`${employee.name} completed: ${currentStep.label}.`);
      return;
    }

    const nextIndex = employee.currentStopIndex + 1;
    const nextStop = employee.currentPlan.stops[nextIndex];
    if (!nextStop) {
      this.completePlan(employee);
      return;
    }

    employee.currentStopIndex = nextIndex;

    if (nextStop.locationId === employee.currentLocationId) {
      employee.status = `Working ${employee.taskTitle} at ${locationLabel(employee.currentLocationId)}`;
      employee.lastUpdatedAt = nowIso();
      return;
    }

    this.beginMove(employee, nextStop.locationId);
  }

  private applyPlan(employee: EmployeeRuntimeRecord, plan: TaskPlan, scripted: boolean) {
    employee.planning = false;
    employee.currentPlan = plan;
    employee.currentStopIndex = 0;
    employee.taskTitle = plan.title;
    employee.checklist = plan.stops.map((stop) => ({
      label: stop.stepLabel,
      done: false,
    }));
    employee.lastUpdatedAt = nowIso();

    const firstStop = plan.stops[0];
    if (!firstStop) {
      this.completePlan(employee);
      return;
    }

    this.pushSystemLog(
      scripted
        ? `${employee.name} received scripted test plan "${plan.title}".`
        : `${employee.name} started plan "${plan.title}".`,
    );

    if (firstStop.locationId === employee.currentLocationId) {
      employee.targetLocationId = null;
      employee.phase = 'working';
      employee.planVersion += 1;
      employee.status = `Working ${employee.taskTitle} at ${locationLabel(employee.currentLocationId)}`;
      return;
    }

    this.beginMove(employee, firstStop.locationId);
  }

  private beginMove(employee: EmployeeRuntimeRecord, targetLocationId: OfficeLocationId) {
    employee.targetLocationId = targetLocationId;
    employee.phase = 'moving';
    employee.planVersion += 1;
    employee.status = `Walking to ${locationLabel(targetLocationId)}`;
    employee.lastUpdatedAt = nowIso();
    this.pushSystemLog(`${employee.name} heads to ${locationLabel(targetLocationId)} for ${employee.taskTitle}.`);
  }

  private completePlan(employee: EmployeeRuntimeRecord) {
    employee.currentPlan = null;
    employee.currentStopIndex = 0;
    employee.targetLocationId = null;
    employee.phase = 'idle';
    employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
    employee.lastUpdatedAt = nowIso();
    employee.planVersion += 1;
    this.pushSystemLog(`${employee.name} completed ${employee.taskTitle}.`);
  }

  private refreshStatus(employee: EmployeeRuntimeRecord) {
    if (employee.planning) {
      employee.status = `Waiting for ${this.meta.transport === 'proxy' ? 'proxy' : 'live'} plan`;
      return;
    }

    if (employee.phase === 'moving' && employee.targetLocationId) {
      employee.status = `Walking to ${locationLabel(employee.targetLocationId)}`;
      return;
    }

    if (employee.phase === 'working') {
      employee.status = `Working ${employee.taskTitle} at ${locationLabel(employee.currentLocationId)}`;
      return;
    }

    employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
  }

  private async requestLivePlan(employeeId: EmployeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee || !this.planner || employee.phase !== 'idle' || employee.planning || this.status.state !== 'running') {
      return;
    }

    employee.planning = true;
    employee.plannerRequestToken += 1;
    const requestToken = employee.plannerRequestToken;
    employee.status = `Waiting for ${this.meta.transport === 'proxy' ? 'proxy' : 'live'} plan`;
    employee.lastUpdatedAt = nowIso();
    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });

    try {
      const plan = await this.fetchLivePlan(employee);
      const current = this.employees.get(employeeId);
      if (!current || current.plannerRequestToken !== requestToken) {
        return;
      }

      current.planning = false;
      current.lastUpdatedAt = nowIso();

      if (this.status.state !== 'running' || current.phase !== 'idle') {
        this.refreshStatus(current);
        this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
        return;
      }

      this.pushSystemLog(`${current.name} received live plan "${plan.title}".`);
      this.applyPlan(current, plan, false);
      this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    } catch (error) {
      const current = this.employees.get(employeeId);
      if (!current || current.plannerRequestToken !== requestToken) {
        return;
      }

      current.planning = false;
      current.lastUpdatedAt = nowIso();
      this.pushSystemLog(`Live planner failed for ${current.name}: ${shortError(error)}. Falling back to scripted plan.`);

      if (this.status.state === 'running' && current.phase === 'idle') {
        this.applyPlan(current, randomFrom(defaultPlansFor(current)), false);
      } else {
        this.refreshStatus(current);
      }

      this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    }
  }

  private async fetchLivePlan(employee: EmployeeRuntimeRecord): Promise<TaskPlan> {
    if (!this.planner) {
      throw new Error('Live planner is not configured.');
    }

    const planner = this.planner;
    const messages = [
      {
        role: 'system',
        content: [
          'You are a task planner for a simulated office staff member.',
          'Return raw JSON only.',
          'Schema: {"title":"string","stops":[{"locationId":"one of the allowed ids","stepLabel":"short step"}]}',
          'Use 2 to 3 stops.',
          'Keep stepLabel concise.',
          `Allowed location ids: ${officeLocationIds.join(', ')}`,
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Employee: ${employee.name}`,
          `Position: ${employee.position}`,
          `Assigned location: ${employee.assignedLocationId} (${locationLabel(employee.assignedLocationId)})`,
          `Current location: ${employee.currentLocationId} (${locationLabel(employee.currentLocationId)})`,
          `Bio: ${employee.bio}`,
          `Default checklist: ${employee.defaultChecklist.join('; ')}`,
          'Generate a realistic next office task sequence.',
        ].join('\n'),
      },
    ];

    this.usage.requestCount += 1;

    const response = await fetch(buildChatCompletionsUrl(planner.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${planner.apiKey}`,
      },
      body: JSON.stringify({
        model: planner.model,
        temperature: PLANNER_TEMPERATURE,
        max_tokens: PLANNER_MAX_TOKENS,
        messages,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Planner HTTP ${response.status}: ${responseText.slice(0, 220)}`);
    }

    let parsedResponse: PlannerChatResponse;
    try {
      parsedResponse = JSON.parse(responseText) as PlannerChatResponse;
    } catch {
      throw new Error('Planner returned invalid JSON.');
    }

    this.recordUsage(parsedResponse.usage);
    const assistantText = extractAssistantText(parsedResponse.choices?.[0]?.message?.content);
    const planPayload = sanitizeLivePlanPayload(extractJsonObject(assistantText), employee.assignedLocationId);

    if (!planPayload) {
      throw new Error('Planner response did not match the expected schema.');
    }

    return buildPlan(planPayload.title, planPayload.stops);
  }

  private recordUsage(rawUsage: unknown) {
    const usageDelta = readUsageTotals(rawUsage);

    this.usage = {
      requestCount: this.usage.requestCount,
      inputTokens: this.usage.inputTokens + usageDelta.inputTokens,
      outputTokens: this.usage.outputTokens + usageDelta.outputTokens,
      totalTokens: this.usage.totalTokens + usageDelta.totalTokens,
      estimatedCostUsd: 0,
    };

    this.usage.estimatedCostUsd = estimateCostUsd(this.usage, this.planner);
  }

  private pushSystemLog(line: string) {
    this.logs.push({
      timestamp: nowIso(),
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

  private broadcast(event: DashboardEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
