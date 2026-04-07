import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import {
  createObsidianVault,
  type VaultEmail,
  type VaultAgentLiveMemory,
  type VaultAgentMemorySummary,
  type VaultKnowledgeSummary,
} from './obsidianVault.ts';

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
  | 'customer-relations'
  | 'war-room'
  | 'coordinator'
  | 'it-support'
  | 'red-terminal'
  | 'archives'
  | 'quality-assurance'
  | 'general-manager';

export type Department = 'react' | 'service' | 'finance' | 'quality' | 'management' | 'it';
export type EmployeePhase = 'idle' | 'moving' | 'working' | 'waiting' | 'paused';
export type PlannerTransport = 'local' | 'direct' | 'proxy';
export type PlanSource = 'default' | 'live' | 'request' | 'test' | 'support';
export type MemoryTier = 'active' | 'passive';
export type MemoryKind = 'task' | 'review' | 'approval' | 'escalation' | 'correction' | 'context';
export type OfficeActionType =
  | 'read_private_notes'
  | 'read_archives'
  | 'review_email'
  | 'fetch_context'
  | 'investigate'
  | 'desk_work'
  | 'draft_email'
  | 'send_email'
  | 'ask_permission'
  | 'request_review'
  | 'second_opinion'
  | 'resolve_request'
  | 'report_back'
  | 'escalate_terminal'
  | 'archive_note';
export type OfficeActionStatus = 'pending' | 'waiting' | 'done';
export type OfficeRequestKind = 'approval' | 'review' | 'second_opinion' | 'investigation';
export type OfficeRequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'escalated';
export type TerminalPriority = 'low' | 'normal' | 'high' | 'critical';
export type TerminalStatus = 'open' | 'acknowledged' | 'resolved';

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

export interface ModelUsageSnapshot {
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface UsageSnapshot {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byModel: ModelUsageSnapshot[];
}

export interface EmployeeSeed {
  id: EmployeeId;
  name: string;
  position: string;
  department: Department;
  assignedLocationId: OfficeLocationId;
  supervisorId: EmployeeId | null;
  preferredModel: string | null;
  bio: string;
  defaultTaskTitle: string;
  defaultChecklist: string[];
}

export interface PlaybookRule {
  id: string;
  title: string;
  summary: string;
}

export interface MemoryItem {
  id: string;
  createdAt: string;
  tier: MemoryTier;
  kind: MemoryKind;
  summary: string;
  referenceId: string | null;
  relatedLocationId: OfficeLocationId | null;
  relatedEmployeeId: EmployeeId | null;
  importance: number;
}

export interface PerformanceStats {
  completedPlans: number;
  reviewRejections: number;
  approvalsGiven: number;
  approvalsReceived: number;
  escalations: number;
  investigations: number;
  corrections: number;
  qualityScore: number;
}

export interface OfficeRequest {
  id: string;
  kind: OfficeRequestKind;
  title: string;
  details: string;
  fromId: EmployeeId;
  toId: EmployeeId;
  locationId: OfficeLocationId;
  status: OfficeRequestStatus;
  createdAt: string;
  updatedAt: string;
  decisionSummary: string | null;
}

export interface OfficeRequestSummary {
  id: string;
  kind: OfficeRequestKind;
  status: OfficeRequestStatus;
  title: string;
  counterpartId: EmployeeId;
  counterpartName: string;
  updatedAt: string;
}

export interface TerminalItem {
  id: string;
  title: string;
  summary: string;
  fromId: EmployeeId;
  priority: TerminalPriority;
  status: TerminalStatus;
  locationId: OfficeLocationId;
  createdAt: string;
  updatedAt: string;
}

interface OfficeAction {
  id: string;
  type: OfficeActionType;
  label: string;
  locationId: OfficeLocationId;
  status: OfficeActionStatus;
  counterpartId: EmployeeId | null;
  requestKind: OfficeRequestKind | null;
  requestId: string | null;
  notes: string | null;
  durationTicks: number;
  ticksWorked: number;
}

interface TaskPlan {
  id: string;
  title: string;
  objective: string;
  source: PlanSource;
  createdAt: string;
  actions: OfficeAction[];
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

interface OllamaChatResponse {
  message?: {
    content?: unknown;
    thinking?: unknown;
  };
  done_reason?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  total_duration?: unknown;
}

interface LiveActionPayload {
  type?: unknown;
  locationId?: unknown;
  label?: unknown;
  counterpartId?: unknown;
  requestKind?: unknown;
  notes?: unknown;
}

interface LivePlanPayload {
  title?: unknown;
  objective?: unknown;
  actions?: unknown;
}

interface LiveEmailStrategyPayload {
  complexity?: unknown;
  needsArchives?: unknown;
  helperEmployeeIds?: unknown;
  draftFocus?: unknown;
  ownerEscalationLikely?: unknown;
}

interface EmployeeRuntimeRecord extends EmployeeSeed {
  currentLocationId: OfficeLocationId;
  targetLocationId: OfficeLocationId | null;
  movementTicksRemaining: number;
  phase: EmployeePhase;
  taskTitle: string;
  objective: string;
  status: string;
  currentPlan: TaskPlan | null;
  currentActionIndex: number;
  planVersion: number;
  lastUpdatedAt: string;
  planning: boolean;
  plannerRequestToken: number;
  plannerRetryAt: number;
  privateNotes: VaultAgentMemorySummary[];
  liveMemory: VaultAgentLiveMemory | null;
  memoryNoteCount: number;
  currentEmail: VaultEmail | null;
  draftedEmailBody: string | null;
  activeMemory: MemoryItem[];
  passiveMemory: MemoryItem[];
  performance: PerformanceStats;
}

export interface EmployeeRuntimeState extends EmployeeSeed {
  currentLocationId: OfficeLocationId;
  targetLocationId: OfficeLocationId | null;
  phase: EmployeePhase;
  status: string;
  taskTitle: string;
  objective: string;
  checklist: string[];
  scriptQueue: OfficeLocationId[];
  planVersion: number;
  lastUpdatedAt: string;
  planning: boolean;
  currentAction: string | null;
  currentActionType: OfficeActionType | null;
  currentEmailSubject: string | null;
  privateNoteCount: number;
  activeMemory: MemoryItem[];
  passiveMemoryCount: number;
  inboundRequests: OfficeRequestSummary[];
  outboundRequests: OfficeRequestSummary[];
  performance: PerformanceStats;
}

export interface EmployeeSnapshot {
  mode: 'live' | 'local';
  tick: number;
  employees: EmployeeRuntimeState[];
  usage: UsageSnapshot;
  requests: OfficeRequest[];
  terminal: {
    items: TerminalItem[];
    openCount: number;
  };
  playbook: PlaybookRule[];
  knowledgeBase: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
  emailSimulator: {
    inboxCount: number;
    sentCount: number;
    pendingSubjects: string[];
  };
  summary: {
    pendingRequests: number;
    openTerminal: number;
    employeesWorking: number;
    employeesWaiting: number;
  };
}

export interface EmployeeSyncEntry {
  id: EmployeeId;
  currentLocationId: OfficeLocationId;
}

export interface EmployeeSyncPayload {
  employees: EmployeeSyncEntry[];
}

interface PersistedEmployeeState {
  activeMemory: MemoryItem[];
  passiveMemory: MemoryItem[];
  performance: PerformanceStats;
}

interface PersistedOfficeState {
  version: number;
  employees: Partial<Record<EmployeeId, PersistedEmployeeState>>;
  processedEmailIds?: string[];
}

const ENGINE_TICK_MS = 800;
const MAX_LOG_ENTRIES = 240;
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5-nano';
const PLANNER_MAX_TOKENS = 420;
const PLANNER_TEMPERATURE = 0.6;
const PLANNER_REQUEST_TIMEOUT_MS = Number(process.env.PLANNER_REQUEST_TIMEOUT_MS ?? 20_000);
const PLANNER_MIN_REQUEST_GAP_MS = Number(process.env.PLANNER_MIN_REQUEST_GAP_MS ?? 0);
const PLANNER_RETRY_BACKOFF_MS = Number(process.env.PLANNER_RETRY_BACKOFF_MS ?? 20_000);
const PLANNER_CIRCUIT_BREAKER_THRESHOLD = Number(process.env.PLANNER_CIRCUIT_BREAKER_THRESHOLD ?? 8);
const PLANNER_CIRCUIT_BREAKER_COOLDOWN_MS = Number(process.env.PLANNER_CIRCUIT_BREAKER_COOLDOWN_MS ?? 120_000);
const ACTIVE_MEMORY_LIMIT = 4;
const PASSIVE_MEMORY_LIMIT = 24;
const MEMORY_CONSOLIDATION_INTERVAL = 12;
const PERSISTED_STATE_VERSION = 2;
const RUNTIME_STATE_FILE = new URL('../../data/office-runtime.json', import.meta.url);
const PROXY_SAFE_MODELS = new Set(['gpt-5.4', 'gpt-5.3']);

const MODEL_PRICING_TABLE: Array<{ match: RegExp; pricing: ModelPricing }> = [
  { match: /^gpt-5(?:\.\d+)?$/i, pricing: { inputCostPer1M: 1.25, outputCostPer1M: 10 } },
  { match: /^gpt-5-mini$/i, pricing: { inputCostPer1M: 0.25, outputCostPer1M: 2 } },
  { match: /^gpt-5-nano$/i, pricing: { inputCostPer1M: 0.05, outputCostPer1M: 0.4 } },
  { match: /^gpt-4o-mini$/i, pricing: { inputCostPer1M: 0.15, outputCostPer1M: 0.6 } },
];

const ACTION_TYPES: OfficeActionType[] = [
  'read_private_notes',
  'read_archives',
  'review_email',
  'fetch_context',
  'investigate',
  'desk_work',
  'draft_email',
  'send_email',
  'ask_permission',
  'request_review',
  'second_opinion',
  'resolve_request',
  'report_back',
  'escalate_terminal',
  'archive_note',
];

export const officeLocationIds: OfficeLocationId[] = [
  'break-room',
  'react-a',
  'react-b',
  'react-c',
  'react-d',
  'customer-relations',
  'war-room',
  'coordinator',
  'it-support',
  'red-terminal',
  'archives',
  'quality-assurance',
  'general-manager',
];

const officeLocationIdSet = new Set<OfficeLocationId>(officeLocationIds);
const legacyOfficeLocationIdMap: Partial<Record<string, OfficeLocationId>> = {
  'customer-service': 'customer-relations',
  accounting: 'coordinator',
  'quality-inspector': 'quality-assurance',
};
const officeLocationPoints = new Map<OfficeLocationId, { x: number; y: number }>([
  ['break-room', { x: 908, y: 705 }],
  ['react-a', { x: 1114, y: 374 }],
  ['react-b', { x: 1450, y: 374 }],
  ['react-c', { x: 1282, y: 542 }],
  ['react-d', { x: 1618, y: 542 }],
  ['customer-relations', { x: 2226, y: 1078 }],
  ['war-room', { x: 3402, y: 966 }],
  ['coordinator', { x: 2506, y: 742 }],
  ['it-support', { x: 618, y: 458 }],
  ['red-terminal', { x: 2929, y: 658 }],
  ['archives', { x: 3152, y: 160 }],
  ['quality-assurance', { x: 2422, y: 1078 }],
  ['general-manager', { x: 3234, y: 378 }],
]);
const employeeIdSet = new Set<EmployeeId>(['sam', 'jeremy']);

const officeLocationLabels: Record<OfficeLocationId, string> = {
  'break-room': 'Break Room',
  'react-a': 'React A',
  'react-b': 'React B',
  'react-c': 'React C',
  'react-d': 'React D',
  'customer-relations': 'Customer Relations',
  'war-room': 'War Room',
  coordinator: 'Coordinator',
  'it-support': 'IT Support',
  'red-terminal': 'Red Terminal',
  archives: 'Archives',
  'quality-assurance': 'Quality Assurance',
  'general-manager': 'General Manager',
};

const defaultPlaybookRules: PlaybookRule[] = [
  {
    id: 'response-window',
    title: 'Customer response window',
    summary: 'Customer-facing issues should be acknowledged quickly and only escalated if policy or money is involved.',
  },
  {
    id: 'financial-approval',
    title: 'Financial approval threshold',
    summary: 'Outgoing commitments, refunds, credits, and exceptions require General Manager approval before they leave the office.',
  },
  {
    id: 'peer-review',
    title: 'Advisory review lane',
    summary: 'Quality Assurance, Coordination, IT, and React can all give advisory opinions, but only the General Manager has internal approval authority.',
  },
  {
    id: 'terminal-escalation',
    title: 'Red Terminal authority',
    summary: 'The Red Terminal / owner is the highest authority. Escalate only for unresolved blockers, policy conflicts, or owner judgment calls.',
  },
  {
    id: 'react-surge',
    title: 'React surge support',
    summary: 'React A, B, C, and D are a reaction team that can be pulled in to help any office workflow when they are free.',
  },
];

const TEMP_ACTIVE_EMPLOYEE_IDS: EmployeeId[] = ['sam', 'jeremy'];
const REDUCED_ROSTER_TEST_MODE = true;
const REDUCED_ROSTER_NOTE =
  'All other staff are missing and status is unknown. Only Sam and Jeremy are currently in the office, and they may cover any role or location as needed.';

const allEmployeeSeeds: EmployeeSeed[] = [
  {
    id: 'sam',
    name: 'Sam',
    position: 'React C',
    department: 'react',
    assignedLocationId: 'react-c',
    supervisorId: null,
    preferredModel: 'gpt-4o-mini',
    bio: 'Steady and patient, Sam keeps the front-end work calm and organized.',
    defaultTaskTitle: 'React C',
    defaultChecklist: ['Check queue', 'Review task board', 'Pair on front-end fix'],
  },
  {
    id: 'jeremy',
    name: 'Jeremy',
    position: 'React D',
    department: 'react',
    assignedLocationId: 'react-d',
    supervisorId: null,
    preferredModel: 'gpt-4o-mini',
    bio: 'Direct and reliable, Jeremy likes quick fixes that remove blockers fast.',
    defaultTaskTitle: 'React D',
    defaultChecklist: ['Check queue', 'Review blocker list', 'Pair on UI pass'],
  },
  {
    id: 'ava-react-a',
    name: 'Ava Kim',
    position: 'React A',
    department: 'react',
    assignedLocationId: 'react-a',
    supervisorId: 'rowan-manager',
    preferredModel: 'gpt-4o-mini',
    bio: 'A quiet prototyper who likes clean interactions and stable systems.',
    defaultTaskTitle: 'React A',
    defaultChecklist: ['Review branch', 'Tighten component states', 'Leave handoff notes'],
  },
  {
    id: 'milo-react-b',
    name: 'Milo Perez',
    position: 'React B',
    department: 'react',
    assignedLocationId: 'react-b',
    supervisorId: 'rowan-manager',
    preferredModel: 'gpt-4o-mini',
    bio: 'Fast-moving and energetic, usually the first one to volunteer for UI polish.',
    defaultTaskTitle: 'React B',
    defaultChecklist: ['Sweep UI issues', 'Validate motion pass', 'Report blockers'],
  },
  {
    id: 'nia-customer-service',
    name: 'Nia Solis',
    position: 'Customer Relations',
    department: 'service',
    assignedLocationId: 'customer-relations',
    supervisorId: 'rowan-manager',
    preferredModel: 'gpt-4o-mini',
    bio: 'Warm, observant, and hard to rattle, with a strong memory for people.',
    defaultTaskTitle: 'Customer Relations',
    defaultChecklist: ['Review inbox', 'Coordinate follow-ups', 'Escalate exceptions'],
  },
  {
    id: 'ellis-accounting',
    name: 'Ellis Hart',
    position: 'Coordinator',
    department: 'finance',
    assignedLocationId: 'coordinator',
    supervisorId: 'rowan-manager',
    preferredModel: 'gpt-5.4',
    bio: 'Methodical and dry-humored, Ellis notices bad numbers immediately.',
    defaultTaskTitle: 'Coordinator',
    defaultChecklist: ['Review office queue', 'Coordinate packets', 'Flag mismatches'],
  },
  {
    id: 'rowan-manager',
    name: 'Rowan Pike',
    position: 'General Manager',
    department: 'management',
    assignedLocationId: 'general-manager',
    supervisorId: null,
    preferredModel: 'gpt-5.4',
    bio: 'Decisive and composed, Rowan keeps the office moving without over-talking.',
    defaultTaskTitle: 'Manager',
    defaultChecklist: ['Check team flow', 'Review escalations', 'Approve priorities'],
  },
  {
    id: 'petra-quality',
    name: 'Petra Vale',
    position: 'Quality Assurance',
    department: 'quality',
    assignedLocationId: 'quality-assurance',
    supervisorId: 'rowan-manager',
    preferredModel: 'gpt-5.4',
    bio: 'Exacting and sharp-eyed, Petra spots tiny breakages before anyone else.',
    defaultTaskTitle: 'Quality Assurance',
    defaultChecklist: ['Inspect output', 'Log defects', 'Push fixes upstream'],
  },
  {
    id: 'june-terminal',
    name: 'June Mercer',
    position: 'IT Support',
    department: 'it',
    assignedLocationId: 'it-support',
    supervisorId: 'rowan-manager',
    preferredModel: 'gpt-4o-mini',
    bio: 'Quick on diagnostics and calm under pressure, June handles office support without drama.',
    defaultTaskTitle: 'IT',
    defaultChecklist: ['Check terminal health', 'Review support queue', 'Resolve office issues'],
  },
];

export const employeeSeeds: EmployeeSeed[] = allEmployeeSeeds.filter((seed) => TEMP_ACTIVE_EMPLOYEE_IDS.includes(seed.id));

const employeeSeedMap = new Map(employeeSeeds.map((seed) => [seed.id, seed] as const));
const primaryCoverageEmployeeId: EmployeeId = employeeSeeds[0]?.id ?? 'sam';
const secondaryCoverageEmployeeId: EmployeeId = employeeSeeds[1]?.id ?? employeeSeeds[0]?.id ?? 'jeremy';
const REACT_TEAM_IDS: EmployeeId[] = employeeSeeds.map((seed) => seed.id);

function availableEmployeeIds(excludingId?: EmployeeId | null) {
  return employeeSeeds
    .map((seed) => seed.id)
    .filter((employeeId) => employeeId !== excludingId);
}

function fallbackCoverageCounterpart(employeeId?: EmployeeId | null) {
  return availableEmployeeIds(employeeId)[0] ?? (employeeSeeds[0]?.id ?? null);
}

function gmEmployeeIdFor(employeeId?: EmployeeId | null) {
  return fallbackCoverageCounterpart(employeeId);
}

function isReactTeamMember(employeeId: EmployeeId) {
  return REACT_TEAM_IDS.includes(employeeId);
}

function defaultReactPeer(employeeId: EmployeeId): EmployeeId {
  return REACT_TEAM_IDS.find((candidate) => candidate !== employeeId) ?? secondaryCoverageEmployeeId;
}

function defaultAdvisoryReviewer(employee: EmployeeRuntimeRecord): EmployeeId | null {
  return fallbackCoverageCounterpart(employee.id);
}

function defaultSecondOpinionCounterpart(employee: EmployeeRuntimeRecord): EmployeeId | null {
  return fallbackCoverageCounterpart(employee.id);
}

function nowIso() {
  return new Date().toISOString();
}

function locationLabel(locationId: OfficeLocationId) {
  return officeLocationLabels[locationId] ?? locationId;
}

function normalizeOfficeLocationId(value: unknown): OfficeLocationId | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  if (officeLocationIdSet.has(value as OfficeLocationId)) {
    return value as OfficeLocationId;
  }

  return legacyOfficeLocationIdMap[value] ?? null;
}

function randomFrom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function trimmedEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBaseUrl(baseUrl: string | null) {
  return (baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
}

function isLoopbackBaseUrl(baseUrl: string) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(baseUrl);
}

function buildChatCompletionsUrl(baseUrl: string) {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

function buildOllamaChatUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/api/chat')) {
    return normalized;
  }
  return `${normalized.replace(/\/v1$/i, '')}/api/chat`;
}

function usesOllamaNativeStructuredOutputs(planner: LivePlannerConfig) {
  return isLoopbackBaseUrl(planner.baseUrl) && planner.model.includes(':');
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
  if (isLoopbackBaseUrl(baseUrl) || /api\.openai\.com/i.test(baseUrl)) {
    return 'direct';
  }

  return 'proxy';
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

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
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
    prompt_eval_count?: unknown;
    eval_count?: unknown;
  };

  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.prompt_eval_count ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.eval_count ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);

  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(0, totalTokens) : 0,
  };
}

function estimateCostUsd(inputTokens: number, outputTokens: number, pricing: ModelPricing) {
  const estimatedCost =
    inputTokens * (pricing.inputCostPer1M / 1_000_000) +
    outputTokens * (pricing.outputCostPer1M / 1_000_000);

  return Number(estimatedCost.toFixed(6));
}

function createPerformanceStats(): PerformanceStats {
  return {
    completedPlans: 0,
    reviewRejections: 0,
    approvalsGiven: 0,
    approvalsReceived: 0,
    escalations: 0,
    investigations: 0,
    corrections: 0,
    qualityScore: 1,
  };
}

function createMemoryItem(
  kind: MemoryKind,
  summary: string,
  options?: {
    referenceId?: string | null;
    relatedLocationId?: OfficeLocationId | null;
    relatedEmployeeId?: EmployeeId | null;
    importance?: number;
  },
): MemoryItem {
  return {
    id: randomUUID(),
    createdAt: nowIso(),
    tier: 'active',
    kind,
    summary,
    referenceId: options?.referenceId ?? null,
    relatedLocationId: options?.relatedLocationId ?? null,
    relatedEmployeeId: options?.relatedEmployeeId ?? null,
    importance: options?.importance ?? 1,
  };
}

function actionStatusMarker(status: OfficeActionStatus) {
  switch (status) {
    case 'done':
      return '[x]';
    case 'waiting':
      return '[~]';
    default:
      return '[ ]';
  }
}

function serializeChecklist(plan: TaskPlan | null) {
  if (!plan) {
    return [];
  }

  return plan.actions.map((action) => `${actionStatusMarker(action.status)} ${action.label}`);
}

function cloneMemoryItem(item: MemoryItem): MemoryItem {
  return { ...item };
}

function clonePerformance(performance: PerformanceStats): PerformanceStats {
  return { ...performance };
}

function buildAction(
  type: OfficeActionType,
  locationId: OfficeLocationId,
  label: string,
  options?: {
    counterpartId?: EmployeeId | null;
    requestKind?: OfficeRequestKind | null;
    notes?: string | null;
    durationTicks?: number;
  },
): OfficeAction {
  return {
    id: randomUUID(),
    type,
    label,
    locationId,
    status: 'pending',
    counterpartId: options?.counterpartId ?? null,
    requestKind: options?.requestKind ?? null,
    requestId: null,
    notes: options?.notes ?? null,
    durationTicks: options?.durationTicks ?? durationForAction(type),
    ticksWorked: 0,
  };
}

function buildPlan(title: string, objective: string, actions: OfficeAction[], source: PlanSource): TaskPlan {
  return {
    id: randomUUID(),
    title,
    objective,
    actions,
    source,
    createdAt: nowIso(),
  };
}

function durationForAction(type: OfficeActionType) {
  switch (type) {
    case 'read_private_notes':
    case 'read_archives':
    case 'review_email':
    case 'fetch_context':
    case 'report_back':
    case 'archive_note':
    case 'send_email':
      return 1;
    case 'investigate':
    case 'desk_work':
    case 'resolve_request':
    case 'draft_email':
      return 2;
    case 'escalate_terminal':
      return 1;
    case 'ask_permission':
    case 'request_review':
    case 'second_opinion':
      return 1;
    default:
      return 1;
  }
}

function isActionType(value: unknown): value is OfficeActionType {
  return typeof value === 'string' && ACTION_TYPES.includes(value as OfficeActionType);
}

function isRequestKind(value: unknown): value is OfficeRequestKind {
  return value === 'approval' || value === 'review' || value === 'second_opinion' || value === 'investigation';
}

function createEmployeeState(seed: EmployeeSeed): EmployeeRuntimeRecord {
  return {
    ...seed,
    currentLocationId: seed.assignedLocationId,
    targetLocationId: null,
    movementTicksRemaining: 0,
    phase: 'idle',
    taskTitle: seed.defaultTaskTitle,
    objective: `${seed.position} is keeping the office moving inside playbook rules.`,
    status: `Holding at ${seed.position}`,
    currentPlan: null,
    currentActionIndex: 0,
    planVersion: 0,
    lastUpdatedAt: nowIso(),
    planning: false,
    plannerRequestToken: 0,
    plannerRetryAt: 0,
    privateNotes: [],
    liveMemory: null,
    memoryNoteCount: 0,
    currentEmail: null,
    draftedEmailBody: null,
    activeMemory: [
      createMemoryItem('context', `${seed.name} is assigned to ${seed.position}.`, {
        relatedLocationId: seed.assignedLocationId,
        importance: 2,
      }),
    ],
    passiveMemory: [],
    performance: createPerformanceStats(),
  };
}

function estimateMovementTicks(fromId: OfficeLocationId, toId: OfficeLocationId) {
  if (fromId === toId) {
    return 0;
  }

  const fromPoint = officeLocationPoints.get(fromId);
  const toPoint = officeLocationPoints.get(toId);
  if (!fromPoint || !toPoint) {
    return 2;
  }

  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const distance = Math.hypot(dx, dy);
  return Math.max(1, Math.min(8, Math.ceil(distance / 380)));
}

function normalizeQualityScore(score: number) {
  return Math.max(0.35, Math.min(1.25, Number(score.toFixed(2))));
}

function ensurePersistedDirectory() {
  mkdirSync(new URL('../../data/', import.meta.url), { recursive: true });
}

function loadPersistedState(): PersistedOfficeState | null {
  try {
    const raw = readFileSync(RUNTIME_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedOfficeState;
    if (!parsed || parsed.version !== PERSISTED_STATE_VERSION || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function defaultCounterpartForAction(employee: EmployeeRuntimeRecord, type: OfficeActionType): EmployeeId | null {
  if (type === 'request_review') {
    return defaultAdvisoryReviewer(employee);
  }

  if (type === 'ask_permission') {
    return gmEmployeeIdFor(employee.id);
  }

  if (type === 'second_opinion') {
    return defaultSecondOpinionCounterpart(employee);
  }

  if (type === 'report_back') {
    return employee.supervisorId ?? gmEmployeeIdFor(employee.id);
  }

  return null;
}

function requestKindForAction(type: OfficeActionType): OfficeRequestKind | null {
  switch (type) {
    case 'ask_permission':
      return 'approval';
    case 'request_review':
      return 'review';
    case 'second_opinion':
      return 'second_opinion';
    default:
      return null;
  }
}

function humanizeActionLabel(value: string) {
  const normalized = value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return 'Office follow-up';
  }
  return normalized
    .split(' ')
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function normalizeLooseActionType(value: unknown): OfficeActionType {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) {
    return 'desk_work';
  }

  const normalized = raw.replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '');
  if (isActionType(normalized)) {
    return normalized;
  }

  if (normalized.includes('private') || normalized.includes('personal_notes')) {
    return 'read_private_notes';
  }
  if (normalized.includes('archive') || normalized.includes('playbook') || normalized.includes('knowledge')) {
    return normalized.includes('archive_note') ? 'archive_note' : 'read_archives';
  }
  if (normalized.includes('email') || normalized.includes('inbox')) {
    if (normalized.includes('draft')) {
      return 'draft_email';
    }
    if (normalized.includes('send')) {
      return 'send_email';
    }
    return 'review_email';
  }
  if (normalized.includes('permission') || normalized.includes('approval') || normalized.includes('sign_off')) {
    return 'ask_permission';
  }
  if (normalized.includes('peer') || normalized.includes('help') || normalized.includes('second_opinion')) {
    return 'second_opinion';
  }
  if (normalized.includes('review')) {
    return normalized.includes('report') ? 'report_back' : 'request_review';
  }
  if (normalized.includes('report') || normalized.includes('status_update')) {
    return 'report_back';
  }
  if (normalized.includes('context') || normalized.includes('project_status')) {
    return 'fetch_context';
  }
  if (normalized.includes('investigate') || normalized.includes('diagnose') || normalized.includes('escalation')) {
    return 'investigate';
  }
  if (normalized.includes('terminal') || normalized.includes('owner')) {
    return 'escalate_terminal';
  }
  return 'desk_work';
}

function defaultLocationForAction(employee: EmployeeRuntimeRecord, actionType: OfficeActionType, counterpartId: EmployeeId | null) {
  switch (actionType) {
    case 'read_private_notes':
      return employee.assignedLocationId;
    case 'read_archives':
    case 'archive_note':
      return 'archives';
    case 'review_email':
    case 'draft_email':
    case 'send_email':
      return 'customer-relations';
    case 'ask_permission':
      return 'general-manager';
    case 'escalate_terminal':
      return 'red-terminal';
    case 'request_review':
    case 'second_opinion':
      return counterpartId ? employeeSeedMap.get(counterpartId)?.assignedLocationId ?? 'war-room' : 'war-room';
    default:
      return employee.assignedLocationId;
  }
}

function sanitizeLivePlanPayload(payload: unknown, employee: EmployeeRuntimeRecord): { title: string; objective: string; actions: OfficeAction[] } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as LivePlanPayload;
  const title = typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : `${employee.defaultTaskTitle} Plan`;
  const objective =
    typeof candidate.objective === 'string' && candidate.objective.trim()
      ? candidate.objective.trim()
      : `${employee.position} is completing a short office run inside the playbook.`;

  if (!Array.isArray(candidate.actions)) {
    return null;
  }

  const actions = candidate.actions
    .map((rawAction) => {
      if (typeof rawAction === 'string') {
        const actionType = normalizeLooseActionType(rawAction);
        const counterpartId = defaultCounterpartForAction(employee, actionType);
        return buildAction(actionType, defaultLocationForAction(employee, actionType, counterpartId), humanizeActionLabel(rawAction), {
          counterpartId,
          requestKind: requestKindForAction(actionType),
        });
      }

      if (!rawAction || typeof rawAction !== 'object') {
        return buildAction('desk_work', employee.assignedLocationId, `${employee.position} follow-up`);
      }

      const parsed = rawAction as LiveActionPayload;
      const actionType = normalizeLooseActionType(parsed.type);
      const counterpartId =
        typeof parsed.counterpartId === 'string' && employeeIdSet.has(parsed.counterpartId as EmployeeId)
          ? (parsed.counterpartId as EmployeeId)
          : defaultCounterpartForAction(employee, actionType);
      const locationId = normalizeOfficeLocationId(parsed.locationId) ?? defaultLocationForAction(employee, actionType, counterpartId);
      const label =
        typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim() : `${employee.position} follow-up`;
      const requestKind = isRequestKind(parsed.requestKind)
        ? parsed.requestKind
        : requestKindForAction(actionType);
      const notes = typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : null;

      return buildAction(actionType, locationId, label, {
        counterpartId,
        requestKind,
        notes,
      });
    })
    .filter((action): action is OfficeAction => Boolean(action))
    .slice(0, 5);

  if (actions.length === 0) {
    return null;
  }

  return { title, objective, actions };
}

function normalizePlanFingerprint(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(morning|daily|workflow|initialization|setup|continuation|review|prioritization|readiness)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readOllamaDoneReason(payload: OllamaChatResponse) {
  return typeof payload.done_reason === 'string' ? payload.done_reason : null;
}

function readOllamaEvalCount(payload: OllamaChatResponse) {
  const count = Number(payload.eval_count ?? 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function supportsRoleModel(model: string) {
  return /^gpt-5(?:\.\d+)?$/i.test(model) || /^gpt-4o-mini$/i.test(model);
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

function roleBacklogBoost(employee: EmployeeRuntimeRecord, pendingRequests: number) {
  if (employee.department === 'react') {
    return pendingRequests > 1;
  }
  return false;
}

function canHandleInbox(employee: EmployeeRuntimeRecord) {
  return employee.department === 'service' || REDUCED_ROSTER_TEST_MODE;
}

const OLLAMA_EMAIL_STRATEGY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['complexity', 'needsArchives', 'helperEmployeeIds', 'draftFocus', 'ownerEscalationLikely'],
  properties: {
    complexity: {
      type: 'string',
      enum: ['simple', 'complex'],
    },
    needsArchives: {
      type: 'boolean',
    },
    helperEmployeeIds: {
      type: 'array',
      items: {
        type: 'string',
        enum: employeeSeeds.map((seed) => seed.id),
      },
    },
    draftFocus: {
      type: 'string',
    },
    ownerEscalationLikely: {
      type: 'boolean',
    },
  },
} as const;

const OLLAMA_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'objective', 'actions'],
  properties: {
    title: {
      type: 'string',
    },
    objective: {
      type: 'string',
    },
    actions: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'locationId', 'label'],
        properties: {
          type: {
            type: 'string',
            enum: ACTION_TYPES,
          },
          locationId: {
            type: 'string',
            enum: officeLocationIds,
          },
          label: {
            type: 'string',
          },
          counterpartId: {
            type: 'string',
            enum: employeeSeeds.map((seed) => seed.id),
          },
          requestKind: {
            type: 'string',
            enum: ['approval', 'review', 'second_opinion', 'investigation'],
          },
          notes: {
            type: 'string',
          },
        },
      },
    },
  },
} as const;

interface EmailHelperPlan {
  employeeId: EmployeeId;
  locationId: OfficeLocationId;
  actionType: OfficeActionType;
  requestKind: OfficeRequestKind;
}

interface EmailHandlingStrategy {
  complexity: 'simple' | 'complex';
  archiveResearch: boolean;
  gmApprovalRequired: boolean;
  ownerEscalationLikely: boolean;
  helpers: EmailHelperPlan[];
  draftFocus: string | null;
}

function emailHelperPlanFor(employeeId: EmployeeId): EmailHelperPlan | null {
  const activeHelperId = employeeIdSet.has(employeeId) ? employeeId : fallbackCoverageCounterpart(null);
  if (!activeHelperId) {
    return null;
  }

  switch (employeeId) {
    case 'ellis-accounting':
      return {
        employeeId: activeHelperId,
        locationId: 'coordinator',
        actionType: 'second_opinion',
        requestKind: 'second_opinion',
      };
    case 'june-terminal':
      return {
        employeeId: activeHelperId,
        locationId: 'it-support',
        actionType: 'second_opinion',
        requestKind: 'second_opinion',
      };
    case 'petra-quality':
      return {
        employeeId: activeHelperId,
        locationId: 'quality-assurance',
        actionType: 'request_review',
        requestKind: 'review',
      };
    case 'sam':
      return {
        employeeId: activeHelperId,
        locationId: 'react-c',
        actionType: 'second_opinion',
        requestKind: 'second_opinion',
      };
    case 'jeremy':
      return {
        employeeId: activeHelperId,
        locationId: 'react-d',
        actionType: 'second_opinion',
        requestKind: 'second_opinion',
      };
    case 'ava-react-a':
      return {
        employeeId: activeHelperId,
        locationId: 'react-a',
        actionType: 'second_opinion',
        requestKind: 'second_opinion',
      };
    case 'milo-react-b':
      return {
        employeeId: activeHelperId,
        locationId: 'react-b',
        actionType: 'second_opinion',
        requestKind: 'second_opinion',
      };
    default:
      return null;
  }
}

function dedupeEmailHelpers(helpers: Array<EmailHelperPlan | null>) {
  return helpers
    .filter((helper): helper is EmailHelperPlan => Boolean(helper))
    .filter((helper, index, allHelpers) => allHelpers.findIndex((candidate) => candidate.employeeId === helper.employeeId) === index);
}

function classifyInboxEmail(email: VaultEmail): EmailHandlingStrategy {
  const haystack = `${email.subject}\n${email.body}`.toLowerCase();
  const finance = /\binvoice\b|\bpayment\b|\brefund\b|\bbilling\b|\bcharge\b|\bcredit\b|\bbookkeeping\b|\bledger\b/.test(haystack);
  const infrastructure = /\bterminal\b|\bproxy\b|\bintegration\b|\bserver\b|\bnetwork\b|\blogin\b|\bsystem\b|\boutage\b/.test(haystack);
  const technical = /\bbug\b|\bbroken\b|\berror\b|\bui\b|\bpage\b|\bwebsite\b|\breact\b|\bcrash\b|\bfront[\s-]?end\b/.test(haystack);
  const quality = /\bquality\b|\bpolish\b|\breview\b|\bvisual\b|\bqa\b/.test(haystack);
  const timeSensitive = /urgent|asap|today|immediately|deadline/.test(haystack);
  const moneyOrPolicy = /refund|credit|discount|waive|exception|payment|chargeback/.test(haystack);
  const repeatPattern = /policy|playbook|history|repeat|again|recurring|vip|duplicate|twice/.test(haystack);
  const archiveResearch = moneyOrPolicy || repeatPattern || quality;
  const categoryCount = [finance, infrastructure, technical, quality].filter(Boolean).length;
  const complexity: 'simple' | 'complex' =
    moneyOrPolicy || repeatPattern || timeSensitive || categoryCount > 1 ? 'complex' : 'simple';

  const helperIds: EmployeeId[] = [];

  if (finance) {
    helperIds.push('ellis-accounting');
  }

  if (infrastructure) {
    helperIds.push('june-terminal');
  }

  if (technical) {
    helperIds.push('sam');
  }

  if (quality || (moneyOrPolicy && repeatPattern)) {
    helperIds.push(fallbackCoverageCounterpart(primaryCoverageEmployeeId) ?? primaryCoverageEmployeeId);
  }

  if (categoryCount > 1) {
    helperIds.push('ava-react-a');
  }

  return {
    complexity,
    archiveResearch,
    gmApprovalRequired: true,
    ownerEscalationLikely: /lawsuit|fraud|legal|chargeback|threat|press|owner decision|human judgment/.test(haystack),
    helpers: dedupeEmailHelpers(helperIds.map((employeeId) => emailHelperPlanFor(employeeId))),
    draftFocus: finance
      ? 'Be clear about what was verified, whether policy allows the refund, and that final confirmation follows GM sign-off.'
      : technical
        ? 'Acknowledge the issue, summarize what was checked, and state the next concrete step.'
        : null,
  };
}

function buildEmailHandlingPlan(employee: EmployeeRuntimeRecord, email: VaultEmail, strategy?: EmailHandlingStrategy): TaskPlan {
  const classification = strategy ?? classifyInboxEmail(email);
  const actions: OfficeAction[] = [
    buildAction('read_private_notes', employee.assignedLocationId, 'Review desk notes and prior drafts'),
    buildAction('review_email', employee.assignedLocationId, `Review inbox email: ${email.subject}`, {
      notes: email.id,
    }),
  ];

  if (classification.archiveResearch) {
    actions.push(buildAction('read_archives', 'archives', `Check archives and playbook for ${email.subject}`));
  }

  for (const helper of classification.helpers) {
    actions.push(
      buildAction(helper.actionType, helper.locationId, `Consult ${locationLabel(helper.locationId)} on ${email.subject}`, {
        counterpartId: helper.employeeId,
        requestKind: helper.requestKind,
        notes: email.id,
      }),
    );
  }

  actions.push(
    buildAction('draft_email', employee.assignedLocationId, `Draft reply to ${email.from}`, {
      notes: email.id,
    }),
  );

  if (classification.gmApprovalRequired) {
    const approvalCounterpart = gmEmployeeIdFor(employee.id);
    actions.push(
      buildAction('ask_permission', 'general-manager', `Request approval for ${email.subject}`, {
        counterpartId: approvalCounterpart,
        requestKind: 'approval',
        notes: classification.ownerEscalationLikely ? `${email.id}\nOwner judgment may be required.` : email.id,
      }),
    );
  }

  actions.push(
    buildAction('send_email', employee.assignedLocationId, `Send reply to ${email.from}`, {
      notes: email.id,
    }),
  );
  actions.push(
    buildAction('archive_note', 'archives', `Archive email resolution for ${email.subject}`, {
      notes: email.id,
    }),
  );

  return buildPlan(
    `Inbox: ${email.subject}`,
    classification.complexity === 'complex'
      ? `${employee.position} is triaging a complex incoming email, consulting the right people, stitching the findings together, getting General Manager approval, and archiving the final result.${classification.draftFocus ? ` Draft focus: ${classification.draftFocus}` : ''}`
      : `${employee.position} is triaging an incoming email, handling the work directly, getting General Manager approval for the final send, and archiving the final result.${classification.draftFocus ? ` Draft focus: ${classification.draftFocus}` : ''}`,
    actions,
    'live',
  );
}

function buildRequestHandlingPlan(employee: EmployeeRuntimeRecord, request: OfficeRequest): TaskPlan {
  const requesterLocation = request.locationId;
  const requesterName = employeeSeeds.find((seed) => seed.id === request.fromId)?.name ?? request.fromId;

  const actions: OfficeAction[] = [
    buildAction('read_private_notes', employee.assignedLocationId, 'Refresh personal memory'),
    buildAction('fetch_context', employee.assignedLocationId, `Review ${request.kind.replace('_', ' ')} context`, {
      notes: request.details,
    }),
    buildAction('read_archives', 'archives', `Check archives and playbook for ${request.title.toLowerCase()}`),
    buildAction('investigate', requesterLocation, `Inspect ${request.title.toLowerCase()}`, {
      counterpartId: request.fromId,
    }),
  ];

  actions.push(
    buildAction('resolve_request', employee.assignedLocationId, `Resolve ${request.kind} for ${requesterName}`, {
      counterpartId: request.fromId,
      notes: request.id,
    }),
  );

  actions.push(
    buildAction('report_back', request.locationId, `Send decision back to ${requesterName}`, {
      counterpartId: request.fromId,
    }),
  );

  return buildPlan(`Handle ${request.kind}`, `Resolve ${request.title.toLowerCase()} without breaking playbook policy.`, actions, 'request');
}

function buildSupportPlan(employee: EmployeeRuntimeRecord): TaskPlan {
  const coverageLocations: OfficeLocationId[] = ['customer-relations', 'coordinator', 'quality-assurance', 'it-support', 'red-terminal'];
  const chosenLocation = randomFrom(coverageLocations);
  const counterpartId = fallbackCoverageCounterpart(employee.id);

  return buildPlan(
    'React Support Surge',
    `${employee.position} is covering overflow to keep the office from bottlenecking.`,
    [
      buildAction('read_private_notes', employee.assignedLocationId, 'Review desk notes before surge support'),
      buildAction('fetch_context', employee.assignedLocationId, 'Review surge queue'),
      buildAction('investigate', chosenLocation, `Cover backlog at ${locationLabel(chosenLocation)}`, {
        counterpartId,
        requestKind: 'investigation',
      }),
      buildAction('report_back', 'general-manager', 'Report support capacity and blockers', {
        counterpartId: gmEmployeeIdFor(employee.id),
      }),
      buildAction('archive_note', 'archives', 'Archive surge support notes'),
    ],
    'support',
  );
}

function buildReducedRosterLeadershipPlan(seed: EmployeeRuntimeRecord): TaskPlan {
  const counterpartId = fallbackCoverageCounterpart(seed.id);

  return buildPlan(
    'Office Leadership Sync',
    `${seed.position} is using free time to stabilize the office: review the playbook, decide temporary leadership, split missing roles, and document the coverage plan.`,
    [
      buildAction('read_archives', 'archives', 'Review playbook for missing-staff coverage'),
      buildAction('fetch_context', 'war-room', 'Hold war-room leadership sync'),
      buildAction('request_review', 'war-room', 'Debate who should take lead on temporary office coverage', {
        counterpartId,
        requestKind: 'review',
      }),
      buildAction('desk_work', 'war-room', 'Choose acting lead and split missing roles'),
      buildAction('archive_note', 'archives', 'Write temporary office coverage protocol'),
    ],
    'default',
  );
}

function buildReducedRosterDiscoveryPlan(seed: EmployeeRuntimeRecord): TaskPlan {
  const counterpartId = fallbackCoverageCounterpart(seed.id);
  const candidateLocations: OfficeLocationId[] = ['customer-relations', 'coordinator', 'it-support', 'quality-assurance', 'red-terminal'];
  const focusLocation = randomFrom(candidateLocations);

  return buildPlan(
    'Task Discovery Sprint',
    `${seed.position} is using open time to inspect the office, propose a worthwhile next task, and record a temporary task board update.`,
    [
      buildAction('read_archives', 'archives', 'Check playbook and unresolved office gaps'),
      buildAction('fetch_context', 'war-room', 'Review temporary task board and pick a next priority'),
      buildAction('investigate', focusLocation, `Inspect ${locationLabel(focusLocation)} for neglected work`),
      buildAction('report_back', 'war-room', `Explain why ${locationLabel(focusLocation)} should stay the next focus`, {
        counterpartId,
      }),
      buildAction('archive_note', 'archives', 'Archive temporary task board update'),
    ],
    'default',
  );
}

function defaultPlansFor(seed: EmployeeRuntimeRecord): TaskPlan[] {
  switch (seed.department) {
    case 'react':
      if (REDUCED_ROSTER_TEST_MODE) {
        const coverageCounterpart = fallbackCoverageCounterpart(seed.id);
        const approvalCounterpart = fallbackCoverageCounterpart(seed.id);

        return [
          buildReducedRosterLeadershipPlan(seed),
          buildReducedRosterDiscoveryPlan(seed),
          buildPlan(
            'Implementation Pass',
            `${seed.position} is handling the core React lane while the rest of the office is unavailable.`,
            [
              buildAction('read_private_notes', seed.assignedLocationId, 'Refresh personal memory'),
              buildAction('fetch_context', seed.assignedLocationId, 'Pull latest task context'),
              buildAction('desk_work', seed.assignedLocationId, 'Complete front-end work pass'),
              buildAction('read_archives', 'archives', 'Review playbook before locking the implementation path'),
              buildAction('report_back', 'war-room', 'Pitch the implementation direction for the next cycle', {
                counterpartId: approvalCounterpart,
              }),
              buildAction('archive_note', 'archives', 'Archive implementation notes'),
            ],
            'default',
          ),
          buildPlan(
            'Customer Coverage Sweep',
            `${seed.position} is covering customer relations while the service desk is missing.`,
            [
              buildAction('fetch_context', 'customer-relations', 'Review inbound customer thread'),
              buildAction('investigate', 'customer-relations', 'Resolve the current customer issue'),
              buildAction('read_archives', 'archives', 'Check playbook and prior service resolutions'),
              buildAction('report_back', 'war-room', 'Report customer resolution and exceptions', {
                counterpartId: approvalCounterpart,
              }),
              buildAction('archive_note', 'archives', 'Archive resolved service notes'),
            ],
            'default',
          ),
          buildPlan(
            'Finance Coverage Sweep',
            `${seed.position} is covering coordination and finance while those desks are offline.`,
            [
              buildAction('fetch_context', 'coordinator', 'Pull the latest coordination and ledger packet'),
              buildAction('investigate', 'coordinator', 'Investigate financial variance and coordination status'),
              buildAction('read_archives', 'archives', 'Check financial playbook and prior reconciliation notes'),
              buildAction('report_back', 'war-room', 'Report reconciliation result', {
                counterpartId: approvalCounterpart,
              }),
              buildAction('archive_note', 'archives', 'Archive reconciled packet'),
            ],
            'default',
          ),
          buildPlan(
            'IT Coverage Sweep',
            `${seed.position} is covering IT support and terminal health while the rest of the office is missing.`,
            [
              buildAction('fetch_context', 'it-support', 'Review support queue and prior incidents'),
              buildAction('investigate', 'red-terminal', 'Investigate terminal and office integration health'),
              buildAction('read_archives', 'archives', 'Check archives for prior incidents and fixes'),
              buildAction('report_back', 'war-room', 'Report support status and next fixes', {
                counterpartId: approvalCounterpart,
              }),
              buildAction('archive_note', 'archives', 'Archive support notes'),
            ],
            'default',
          ),
        ];
      }

      return [
        buildPlan(
          'Implementation Pass',
          `${seed.position} is pulling context, shipping a bounded implementation pass, and reporting the result back into the office.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Refresh personal memory'),
            buildAction('fetch_context', seed.assignedLocationId, 'Pull latest task context'),
            buildAction('desk_work', seed.assignedLocationId, 'Complete front-end work pass'),
            buildAction('second_opinion', 'react-a', 'Get a peer read on the implementation pass', {
              counterpartId: defaultReactPeer(seed.id),
              requestKind: 'second_opinion',
            }),
            buildAction('report_back', 'general-manager', 'Report implementation status', {
              counterpartId: gmEmployeeIdFor(seed.id),
            }),
            buildAction('archive_note', 'archives', 'Archive implementation notes'),
          ],
          'default',
        ),
        buildPlan(
          'Cross-Team Investigation',
          `${seed.position} is investigating a user-facing issue, collaborating with the React team, and reporting the findings back into the office.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Refresh personal memory'),
            buildAction('fetch_context', 'customer-relations', 'Review issue intake'),
            buildAction('investigate', seed.assignedLocationId, 'Trace issue through assigned desk'),
            buildAction('second_opinion', 'react-d', 'Get second opinion on fix path', {
              counterpartId: defaultReactPeer(seed.id),
              requestKind: 'second_opinion',
            }),
            buildAction('report_back', 'general-manager', 'Report the investigation packet', {
              counterpartId: gmEmployeeIdFor(seed.id),
            }),
            buildAction('archive_note', 'archives', 'Archive issue findings'),
          ],
          'default',
        ),
      ];

    case 'service':
      return [
        buildPlan(
          'Inbox Exception Pass',
          `${seed.position} is resolving customer issues while getting approval for anything that crosses policy boundaries.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Review desk notes and prior conversations'),
            buildAction('fetch_context', 'customer-relations', 'Review inbound customer thread'),
            buildAction('investigate', 'customer-relations', 'Investigate booking and complaint details'),
            buildAction('read_archives', 'archives', 'Check playbook and prior service resolutions'),
            buildAction('report_back', 'customer-relations', 'Close the loop with the customer'),
            buildAction('archive_note', 'archives', 'Archive resolved service notes'),
          ],
          'default',
        ),
      ];

    case 'finance':
      return [
        buildPlan(
          'Invoice Reconciliation',
          `${seed.position} is reconciling payments and routing the packet through manager approval.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Review private coordination notes'),
            buildAction('fetch_context', 'coordinator', 'Pull the latest coordination and ledger packet'),
            buildAction('investigate', 'coordinator', 'Investigate financial variance and coordination status'),
            buildAction('read_archives', 'archives', 'Check financial playbook and prior reconciliation notes'),
            buildAction('report_back', 'general-manager', 'Report reconciliation result'),
            buildAction('archive_note', 'archives', 'Archive reconciled packet'),
          ],
          'default',
        ),
      ];

    case 'quality':
      return [
        buildPlan(
          'Review Queue',
          `${seed.position} is reviewing handoffs and writing corrections back into the office.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Review private QA notes'),
            buildAction('fetch_context', 'quality-assurance', 'Review incoming handoff queue'),
            buildAction('read_archives', 'archives', 'Check archives for prior defects and standards'),
            buildAction('investigate', 'quality-assurance', 'Inspect latest office output'),
            buildAction('report_back', 'general-manager', 'Report quality findings'),
            buildAction('archive_note', 'archives', 'Archive review notes'),
          ],
          'default',
        ),
      ];

    case 'management':
      return [
        buildPlan(
          'Management Sweep',
          `${seed.position} is auditing approvals, collecting second opinions, and deciding what reaches the owner.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Review private manager notes'),
            buildAction('fetch_context', 'general-manager', 'Review approvals and exception queue'),
            buildAction('read_archives', 'archives', 'Review playbook and shared knowledge before decisions'),
            buildAction('investigate', 'general-manager', 'Audit today’s office risk points'),
            buildAction('report_back', 'general-manager', 'Set the next operating priorities'),
            buildAction('archive_note', 'archives', 'Archive manager decisions'),
          ],
          'default',
        ),
      ];

    case 'it':
      return [
        buildPlan(
          'Terminal Diagnostic',
          `${seed.position} is investigating office infrastructure and escalating anything that needs human attention.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Review private IT notes'),
            buildAction('fetch_context', 'it-support', 'Review support queue and prior incidents'),
            buildAction('read_archives', 'archives', 'Check archives for prior incidents and fixes'),
            buildAction('investigate', 'red-terminal', 'Investigate terminal and office integration health'),
            buildAction('report_back', 'general-manager', 'Report support status and next fixes'),
            buildAction('archive_note', 'archives', 'Archive support notes'),
          ],
          'default',
        ),
      ];

    default:
      return [
        buildPlan(
          seed.defaultTaskTitle,
          `${seed.position} is executing a short office run.`,
          [
            buildAction('read_private_notes', seed.assignedLocationId, 'Refresh personal memory'),
            buildAction('fetch_context', seed.assignedLocationId, seed.defaultChecklist[0] ?? 'Review work queue'),
            buildAction('desk_work', seed.assignedLocationId, seed.defaultChecklist[1] ?? 'Complete assigned work'),
            buildAction('archive_note', 'archives', seed.defaultChecklist[2] ?? 'Record completion notes'),
          ],
          'default',
        ),
      ];
  }
}

function buildRandomTestPlan(seed: EmployeeRuntimeRecord): TaskPlan {
  const first = randomFrom(officeLocationIds);
  const second = randomFrom(officeLocationIds.filter((locationId) => locationId !== first));
  const third = randomFrom(officeLocationIds.filter((locationId) => locationId !== first && locationId !== second));
  const counterpart = seed.supervisorId ?? gmEmployeeIdFor(seed.id);
  const advisoryCounterpart =
    seed.department === 'react' ? defaultReactPeer(seed.id) : defaultAdvisoryReviewer(seed) ?? counterpart;
  const advisoryLocation = employeeSeeds.find((candidate) => candidate.id === advisoryCounterpart)?.assignedLocationId ?? second;

  return buildPlan(
    `Test ${seed.defaultTaskTitle}`,
    `${seed.position} is running a scripted office test to verify routing, collaboration, and final sign-off behavior.`,
    [
      buildAction('fetch_context', first, `Move to ${locationLabel(first)} and gather context`),
      buildAction('desk_work', second, `Perform scripted work at ${locationLabel(second)}`),
      buildAction('second_opinion', advisoryLocation, 'Request a quick advisory pass on the scripted result', {
        counterpartId: advisoryCounterpart,
        requestKind: 'second_opinion',
      }),
      buildAction('report_back', third, `Report test result from ${locationLabel(third)}`, {
        counterpartId: counterpart,
      }),
    ],
    'test',
  );
}

function injectActionBeforeArchive(actions: OfficeAction[], nextAction: OfficeAction) {
  const archiveIndex = actions.findIndex((action) => action.type === 'archive_note');
  if (archiveIndex === -1) {
    actions.push(nextAction);
    return;
  }
  actions.splice(archiveIndex, 0, nextAction);
}

function applyPlaybookGuardrails(employee: EmployeeRuntimeRecord, plan: TaskPlan) {
  const approvalCounterpart = gmEmployeeIdFor(employee.id);
  const actions = plan.actions.map((action) => {
    const normalized = { ...action };

    if (normalized.type === 'ask_permission') {
      normalized.locationId = 'general-manager';
      normalized.counterpartId = approvalCounterpart;
      normalized.requestKind = 'approval';
      if (!approvalCounterpart) {
        normalized.type = 'escalate_terminal';
        normalized.locationId = 'red-terminal';
        normalized.counterpartId = null;
        normalized.requestKind = null;
        normalized.label = normalized.label.replace(/^Request approval/i, 'Escalate');
      }
    }

    if (normalized.type === 'request_review') {
      normalized.counterpartId = normalized.counterpartId ?? defaultAdvisoryReviewer(employee);
      normalized.requestKind = 'review';
    }

    if (normalized.type === 'second_opinion') {
      normalized.counterpartId = normalized.counterpartId ?? defaultSecondOpinionCounterpart(employee);
      normalized.requestKind = 'second_opinion';
    }

    if (normalized.counterpartId === employee.id) {
      normalized.counterpartId =
        normalized.type === 'second_opinion'
          ? defaultSecondOpinionCounterpart(employee)
          : normalized.type === 'request_review'
            ? defaultAdvisoryReviewer(employee)
            : normalized.type === 'ask_permission'
              ? approvalCounterpart
              : normalized.counterpartId;
    }

    return normalized;
  });

  if (!actions.some((action) => action.type === 'archive_note')) {
    actions.push(buildAction('archive_note', 'archives', 'Archive operational notes'));
  }

  const sendEmailIndex = actions.findIndex((action) => action.type === 'send_email');
  const hasApproval = actions.some((action) => action.type === 'ask_permission');
  if (sendEmailIndex !== -1 && approvalCounterpart && !hasApproval) {
    actions.splice(
      sendEmailIndex,
      0,
      buildAction('ask_permission', 'general-manager', `Request approval for outgoing response from ${employee.position}`, {
        counterpartId: approvalCounterpart,
        requestKind: 'approval',
      }),
    );
  }

  if (!approvalCounterpart && !actions.some((action) => action.type === 'escalate_terminal')) {
    const needsOwnerJudgment = actions.some(
      (action) => /owner|human judgment|policy conflict/i.test(action.label) || /owner|human judgment|policy conflict/i.test(action.notes ?? ''),
    );
    if (needsOwnerJudgment) {
      injectActionBeforeArchive(
        actions,
        buildAction('escalate_terminal', 'red-terminal', 'Escalate unresolved owner-level decision', {
          notes: 'Playbook escalation guardrail',
        }),
      );
    }
  }

  return {
    ...plan,
    actions,
  };
}

export class OfficeSimulationEngine {
  private readonly listeners = new Set<(event: DashboardEvent) => void>();
  private readonly employees = new Map(employeeSeeds.map((seed) => [seed.id, createEmployeeState(seed)] as const));
  private readonly requests = new Map<string, OfficeRequest>();
  private readonly terminalItems = new Map<string, TerminalItem>();
  private readonly vault = createObsidianVault();
  private readonly planner: LivePlannerConfig | null;
  private readonly meta: RunnerMeta;
  private interval: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private logs: LogEntry[] = [];
  private playbookRules: PlaybookRule[] = defaultPlaybookRules.map((rule) => ({ ...rule }));
  private knowledgeSummaries: VaultKnowledgeSummary[] = [];
  private readonly repetitionCounts = new Map<string, number>();
  private readonly processedEmailIds = new Set<string>();
  private plannerQueue: EmployeeId[] = [];
  private plannerBusy = false;
  private plannerQueueTimer: NodeJS.Timeout | null = null;
  private plannerNextAvailableAt = 0;
  private plannerFailureStreak = 0;
  private plannerCircuitOpenUntil = 0;
  private usage: UsageSnapshot = {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byModel: [],
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
    for (const seed of employeeSeeds) {
      this.vault.ensureEmployeeWorkspace(seed.name);
    }
    this.refreshVaultContext();
    this.hydratePersistedState();
    for (const employee of this.employees.values()) {
      this.syncLiveMemory(employee);
    }
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
    const inboxEmails = this.pendingInboxEmails();
    const sentEmails = this.vault.loadSentEmails();
    const employees = [...this.employees.values()].map((employee) => {
      const currentAction = this.currentAction(employee);
      return {
        id: employee.id,
        name: employee.name,
        position: employee.position,
        department: employee.department,
        assignedLocationId: employee.assignedLocationId,
        supervisorId: employee.supervisorId,
        preferredModel: employee.preferredModel,
        bio: employee.bio,
        defaultTaskTitle: employee.defaultTaskTitle,
        defaultChecklist: [...employee.defaultChecklist],
        currentLocationId: employee.currentLocationId,
        targetLocationId: employee.targetLocationId,
        phase: employee.phase,
        status: employee.status,
        taskTitle: employee.taskTitle,
        objective: employee.objective,
        checklist: serializeChecklist(employee.currentPlan),
        scriptQueue: this.remainingLocationQueue(employee),
        planVersion: employee.planVersion,
        lastUpdatedAt: employee.lastUpdatedAt,
        planning: employee.planning,
        currentAction: currentAction?.label ?? null,
        currentActionType: currentAction?.type ?? null,
        currentEmailSubject: employee.currentEmail?.subject ?? null,
        privateNoteCount: employee.memoryNoteCount,
        activeMemory: employee.activeMemory.map(cloneMemoryItem),
        passiveMemoryCount: employee.passiveMemory.length,
        inboundRequests: this.requestSummariesForEmployee(employee.id, 'inbound'),
        outboundRequests: this.requestSummariesForEmployee(employee.id, 'outbound'),
        performance: clonePerformance(employee.performance),
      };
    });

    return {
      mode: this.meta.live ? 'live' : 'local',
      tick: this.tickCount,
      employees,
      usage: {
        ...this.usage,
        byModel: this.usage.byModel.map((entry) => ({ ...entry })),
      },
      requests: [...this.requests.values()].map((request) => ({ ...request })),
      terminal: {
        items: [...this.terminalItems.values()].map((item) => ({ ...item })),
        openCount: [...this.terminalItems.values()].filter((item) => item.status === 'open').length,
      },
      playbook: this.playbookRules.map((rule) => ({ ...rule })),
      knowledgeBase: this.knowledgeSummaries.map((note) => ({
        id: note.id,
        title: note.title,
        summary: note.summary,
      })),
      emailSimulator: {
        inboxCount: inboxEmails.length,
        sentCount: sentEmails.length,
        pendingSubjects: inboxEmails.map((email) => email.subject).slice(0, 5),
      },
      summary: {
        pendingRequests: [...this.requests.values()].filter((request) => request.status === 'pending').length,
        openTerminal: [...this.terminalItems.values()].filter((item) => item.status === 'open').length,
        employeesWorking: employees.filter((employee) => employee.phase === 'working' || employee.phase === 'moving').length,
        employeesWaiting: employees.filter((employee) => employee.phase === 'waiting' || employee.planning).length,
      },
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
        employee.phase = employee.targetLocationId ? 'moving' : this.currentAction(employee) ? 'working' : 'idle';
      }
      this.refreshStatus(employee);
    }

    this.ensureInterval();
    this.tick();
    this.pushSystemLog(
      this.meta.live
        ? `${this.meta.transport === 'proxy' ? 'Proxy' : 'Direct'} office runtime started on ${this.meta.model ?? DEFAULT_OPENAI_MODEL}.`
        : 'Local office runtime started with scripted behavior.',
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
      this.syncLiveMemory(employee);
    }
    this.plannerQueue = [];
    this.plannerBusy = false;
    this.clearPlannerQueueTimer();
    this.plannerNextAvailableAt = 0;
    this.plannerFailureStreak = 0;
    this.plannerCircuitOpenUntil = 0;

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
      byModel: [],
    };
    this.requests.clear();
    this.terminalItems.clear();
    this.repetitionCounts.clear();
    this.processedEmailIds.clear();
    this.plannerQueue = [];
    this.plannerBusy = false;
    this.clearPlannerQueueTimer();
    this.plannerNextAvailableAt = 0;
    this.plannerFailureStreak = 0;
    this.plannerCircuitOpenUntil = 0;
    this.employees.clear();
    for (const seed of employeeSeeds) {
      this.employees.set(seed.id, createEmployeeState(seed));
    }
    this.refreshVaultContext();
    for (const employee of this.employees.values()) {
      this.syncLiveMemory(employee);
    }
    this.persistState();

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
    this.plannerQueue = [];
    this.plannerBusy = false;
    this.clearPlannerQueueTimer();
    this.plannerNextAvailableAt = 0;

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
      const normalizedCurrentLocationId = normalizeOfficeLocationId(entry.currentLocationId);
      if (!employee || !normalizedCurrentLocationId) {
        continue;
      }

      const isArrivalSync = employee.phase === 'moving' && employee.targetLocationId === normalizedCurrentLocationId;
      if (!isArrivalSync && normalizedCurrentLocationId !== employee.currentLocationId) {
        continue;
      }

      employee.lastUpdatedAt = nowIso();

      if (isArrivalSync) {
        employee.currentLocationId = normalizedCurrentLocationId;
        employee.phase = 'working';
        employee.targetLocationId = null;
        employee.movementTicksRemaining = 0;
        employee.status = `Working ${employee.taskTitle} at ${locationLabel(normalizedCurrentLocationId)}`;
        employee.planVersion += 1;
        this.pushSystemLog(`${employee.name} arrived at ${locationLabel(normalizedCurrentLocationId)} for ${employee.taskTitle}.`);
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
    this.plannerQueue = [];
    this.plannerBusy = false;
    this.clearPlannerQueueTimer();
    this.plannerNextAvailableAt = 0;
  }

  private hydratePersistedState() {
    const persisted = loadPersistedState();
    if (!persisted) {
      return;
    }

    for (const employee of this.employees.values()) {
      const persistedEmployee = persisted.employees[employee.id];
      if (!persistedEmployee) {
        continue;
      }

      employee.activeMemory = Array.isArray(persistedEmployee.activeMemory)
        ? persistedEmployee.activeMemory.map(cloneMemoryItem).slice(-ACTIVE_MEMORY_LIMIT)
        : employee.activeMemory;
      employee.passiveMemory = Array.isArray(persistedEmployee.passiveMemory)
        ? persistedEmployee.passiveMemory.map(cloneMemoryItem).slice(-PASSIVE_MEMORY_LIMIT)
        : employee.passiveMemory;
      employee.performance = persistedEmployee.performance ? clonePerformance(persistedEmployee.performance) : employee.performance;
    }

    for (const emailId of persisted.processedEmailIds ?? []) {
      if (typeof emailId === 'string' && emailId) {
        this.processedEmailIds.add(emailId);
      }
    }
  }

  private persistState() {
    ensurePersistedDirectory();
    const payload: PersistedOfficeState = {
      version: PERSISTED_STATE_VERSION,
      employees: {},
      processedEmailIds: [...this.processedEmailIds],
    };

    for (const employee of this.employees.values()) {
      payload.employees[employee.id] = {
        activeMemory: employee.activeMemory.map(cloneMemoryItem),
        passiveMemory: employee.passiveMemory.map(cloneMemoryItem),
        performance: clonePerformance(employee.performance),
      };
    }

    writeFileSync(RUNTIME_STATE_FILE, JSON.stringify(payload, null, 2));
  }

  private refreshVaultContext() {
    const vaultRules = this.vault.loadPlaybookRules().map((rule) => ({
      id: rule.id,
      title: rule.title,
      summary: rule.summary,
    }));
    this.playbookRules = vaultRules.length > 0 ? vaultRules : defaultPlaybookRules.map((rule) => ({ ...rule }));
    this.knowledgeSummaries = this.vault.loadKnowledgeSummaries();
    for (const employee of this.employees.values()) {
      this.refreshEmployeeMemoryWorkspace(employee);
    }
  }

  private buildAgentMemoryQuery(employee: EmployeeRuntimeRecord) {
    const queryParts = [employee.taskTitle, employee.objective];
    const pendingRequest = this.nextPendingRequestFor(employee.id);
    if (pendingRequest) {
      queryParts.push(pendingRequest.title, pendingRequest.details);
    }
    if (employee.currentEmail) {
      queryParts.push(employee.currentEmail.subject, employee.currentEmail.summary);
    }
    return queryParts.filter(Boolean).join(' ');
  }

  private refreshEmployeeMemoryWorkspace(employee: EmployeeRuntimeRecord) {
    const query = this.buildAgentMemoryQuery(employee);
    employee.privateNotes = this.vault.searchAgentMemories(employee.name, query, 5);
    employee.liveMemory = this.vault.loadAgentLiveMemory(employee.name);
    employee.memoryNoteCount = this.vault.countAgentMemories(employee.name);
  }

  private syncLiveMemory(employee: EmployeeRuntimeRecord) {
    const checklist = serializeChecklist(employee.currentPlan).slice(0, 5);
    const openLoops = [
      ...this.requestSummariesForEmployee(employee.id, 'inbound').map(
        (request) => `${request.kind}: ${request.title} from ${request.counterpartName} (${request.status})`,
      ),
      ...this.requestSummariesForEmployee(employee.id, 'outbound').map(
        (request) => `${request.kind}: ${request.title} for ${request.counterpartName} (${request.status})`,
      ),
      ...(employee.currentEmail ? [`Email: ${employee.currentEmail.subject} from ${employee.currentEmail.from}`] : []),
    ].slice(0, 4);
    const recentContext = employee.activeMemory.slice(-2).map((item) => item.summary);

    this.vault.writeAgentLiveMemory({
      employeeName: employee.name,
      status: employee.phase,
      focus: employee.currentPlan ? employee.taskTitle : 'Awaiting the next concrete task.',
      objective: employee.currentPlan ? employee.objective : 'No active plan. Check priorities, pending requests, or ask leadership for the next useful initiative.',
      checklist,
      openLoops,
      recentContext,
    });
    this.refreshEmployeeMemoryWorkspace(employee);
  }

  private storeLongTermMemory(
    employee: EmployeeRuntimeRecord,
    entry: {
      title: string;
      summary: string;
      details: string;
      kind: MemoryKind | 'note';
      tags?: string[];
      importance?: number;
      referenceId?: string | null;
      relatedEmployeeId?: EmployeeId | null;
      relatedLocationId?: OfficeLocationId | null;
    },
  ) {
    this.vault.appendAgentMemory({
      employeeName: employee.name,
      title: entry.title,
      summary: entry.summary,
      details: entry.details,
      kind: entry.kind,
      tags: entry.tags,
      importance: entry.importance,
      referenceId: entry.referenceId,
      relatedLocationId: entry.relatedLocationId,
      relatedEmployeeName: entry.relatedEmployeeId ? this.employees.get(entry.relatedEmployeeId)?.name ?? entry.relatedEmployeeId : null,
    });
    this.refreshEmployeeMemoryWorkspace(employee);
  }

  private logAgentEvent(employee: EmployeeRuntimeRecord, heading: string, body: string) {
    this.vault.appendAgentLog({
      employeeName: employee.name,
      heading,
      body,
    });
  }

  private archiveKnowledge(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    const plan = employee.currentPlan;
    const checklistState = plan ? serializeChecklist(plan).map((item) => `- ${item}`).join('\n') : '';
    this.vault.appendSharedKnowledge({
      title: `${employee.position} ${employee.taskTitle}`,
      summary: `${employee.name} archived a completed office action from ${locationLabel(action.locationId)}.`,
      details: [
        `Objective: ${employee.objective}`,
        `Current action: ${action.label}`,
        plan ? `Checklist state:\n${checklistState}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      sourceEmployee: employee.name,
      tags: [employee.department, 'archive', slugify(employee.taskTitle)],
    });
    this.storeLongTermMemory(employee, {
      title: employee.taskTitle,
      summary: `Archived a completed task at ${locationLabel(action.locationId)}.`,
      details: [
        `Objective: ${employee.objective}`,
        `Current action: ${action.label}`,
        checklistState ? `Checklist state:\n${checklistState}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      kind: 'task',
      tags: [employee.department, 'archive', slugify(employee.taskTitle)],
      importance: 3,
      referenceId: employee.currentPlan?.id ?? null,
      relatedLocationId: action.locationId,
    });
    this.refreshVaultContext();
    if (/temporary office coverage protocol|temporary task board update/i.test(action.label)) {
      this.vault.upsertPlaybookProposal({
        title: `${employee.position} temporary coverage protocol`,
        context: `${employee.name} documented a temporary operating note while the office was missing staff.`,
        recommendation: `Capture the temporary staffing rule in the playbook, including acting lead, coverage lanes, and how new priorities are chosen during quiet periods.`,
        sourceEmployee: employee.name,
      });
      this.refreshVaultContext();
    }
    this.logAgentEvent(
      employee,
      'Archive Note',
      `Archived shared knowledge for "${employee.taskTitle}" at ${locationLabel(action.locationId)}.`,
    );
    this.syncLiveMemory(employee);
  }

  private maybeProposePlaybookPattern(employee: EmployeeRuntimeRecord, title: string) {
    const key = `${employee.position}:${title}`;
    const count = (this.repetitionCounts.get(key) ?? 0) + 1;
    this.repetitionCounts.set(key, count);

    if (count < 3 || count % 3 !== 0) {
      return;
    }

    this.vault.upsertPlaybookProposal({
      title: `${employee.position} repetitive workflow: ${title}`,
      context: `${employee.name} has completed "${title}" ${count} times. This now looks like a repeatable office pattern worth standardizing.`,
      recommendation: `Document the standard operating sequence for "${title}", including review, approval, and archive requirements.`,
      sourceEmployee: employee.name,
    });
    this.refreshVaultContext();
    this.logAgentEvent(
      employee,
      'Playbook Proposal',
      `Proposed a new playbook pattern for repeated workflow "${title}" after ${count} repetitions.`,
    );
  }

  private proposePlaybookGap(employee: EmployeeRuntimeRecord, title: string, summary: string) {
    this.vault.upsertPlaybookProposal({
      title,
      context: summary,
      recommendation: 'Add an explicit standing rule to the Playbook so future agents can resolve this case without ambiguity.',
      sourceEmployee: employee.name,
    });
    this.refreshVaultContext();
    this.logAgentEvent(employee, 'Playbook Gap', `Proposed a playbook update for "${title}".\n\n${summary}`);
  }

  private pendingInboxEmails() {
    return this.vault.loadInboxEmails().filter((email) => !this.processedEmailIds.has(email.id));
  }

  private hasOfficeBootstrapRecord() {
    return [...this.employees.values()].some((employee) =>
      [...employee.activeMemory, ...employee.passiveMemory].some((memory) =>
        /office leadership sync|temporary office coverage protocol|task discovery sprint|temporary task board update/i.test(memory.summary),
      ),
    );
  }

  private buildReducedRosterFallbackPlan(employee: EmployeeRuntimeRecord) {
    if (!this.hasOfficeBootstrapRecord()) {
      return buildReducedRosterLeadershipPlan(employee);
    }

    const weightedPlans = [buildReducedRosterDiscoveryPlan(employee), ...defaultPlansFor(employee)];
    return randomFrom(weightedPlans);
  }

  private resolveInboxEmail(emailId: string | null) {
    const inboxEmails = this.pendingInboxEmails();
    if (emailId) {
      return inboxEmails.find((email) => email.id === emailId) ?? null;
    }
    return inboxEmails[0] ?? null;
  }

  private readPrivateDeskNotes(employee: EmployeeRuntimeRecord) {
    this.refreshEmployeeMemoryWorkspace(employee);
    const liveMemory = employee.liveMemory;
    const noteList = employee.privateNotes.slice(0, 3).map((note) => `- ${note.title}: ${note.summary}`).join('\n');
    const liveMemoryBody = [
      `Focus: ${liveMemory?.focus ?? 'Awaiting the next concrete task.'}`,
      `Objective: ${liveMemory?.objective ?? 'No active plan.'}`,
      `Checklist: ${(liveMemory?.checklist ?? []).join(' | ') || 'none'}`,
      `Open loops: ${(liveMemory?.openLoops ?? []).join(' | ') || 'none'}`,
    ].join('\n');

    this.addMemory(employee.id, 'context', `${employee.name} refreshed personal memory and recalled prior notes.`, {
      relatedLocationId: employee.assignedLocationId,
      importance: 2,
    });
    this.logAgentEvent(
      employee,
      'Memory Workspace Checked',
      `${liveMemoryBody}\n\nRecalled long-term memory:\n${noteList || '- none'}`,
    );
    this.syncLiveMemory(employee);
  }

  private readArchiveMaterials(employee: EmployeeRuntimeRecord) {
    this.refreshVaultContext();
    const playbookList = this.playbookRules.slice(0, 4).map((rule) => `- ${rule.title}: ${rule.summary}`).join('\n');
    const knowledgeList = this.knowledgeSummaries.slice(0, 4).map((note) => `- ${note.title}: ${note.summary}`).join('\n');
    this.addMemory(employee.id, 'context', `${employee.name} reviewed the Archives and refreshed playbook context.`, {
      relatedLocationId: 'archives',
      importance: 3,
    });
    this.logAgentEvent(
      employee,
      'Archives Consulted',
      `Playbook:\n${playbookList || '- none'}\n\nShared knowledge:\n${knowledgeList || '- none'}`,
    );
    this.syncLiveMemory(employee);
  }

  private reviewInboxEmail(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    const email = this.resolveInboxEmail(action.notes);
    if (!email) {
      this.logAgentEvent(employee, 'Inbox Check', 'No pending inbox emails were available.');
      return;
    }

    employee.currentEmail = email;
    employee.draftedEmailBody = null;
    this.addMemory(employee.id, 'context', `${employee.name} reviewed inbox email "${email.subject}" from ${email.from}.`, {
      referenceId: email.id,
      relatedLocationId: employee.assignedLocationId,
      importance: 3,
    });
    this.logAgentEvent(
      employee,
      'Inbox Email Reviewed',
      `Subject: ${email.subject}\nFrom: ${email.from}\nTo: ${email.to}\n\n${email.body}`,
    );
    this.syncLiveMemory(employee);
  }

  private composeEmailDraft(employee: EmployeeRuntimeRecord, email: VaultEmail) {
    const senderName = email.from.split('@')[0]?.replace(/[._-]+/g, ' ') || email.from;
    const helperNames = Array.from(
      new Set(
        (employee.currentPlan?.actions ?? [])
          .filter((action) => action.type === 'second_opinion' || action.type === 'request_review')
          .map((action) => action.counterpartId)
          .filter((counterpartId): counterpartId is EmployeeId => Boolean(counterpartId))
          .map((counterpartId) => this.employees.get(counterpartId)?.name ?? counterpartId),
      ),
    );
    const approvalAction = (employee.currentPlan?.actions ?? []).find((action) => action.type === 'ask_permission');
    const approvalStatus = approvalAction?.requestId ? this.requests.get(approvalAction.requestId)?.status ?? null : null;
    const approvalResolved = approvalStatus === 'approved' || approvalStatus === 'fulfilled';

    const internalNote =
      helperNames.length > 0
        ? `I reviewed this with ${helperNames.join(', ')} before finalizing the response.`
        : 'I reviewed the request directly and handled the full office pass on my desk.';
    const approvalNote = approvalResolved
      ? 'The response below reflects the current office decision under General Manager sign-off.'
      : 'The final outgoing response is still waiting on General Manager sign-off before anything is confirmed.';
    const closingNote = approvalResolved
      ? 'If anything changes on our side, I will follow up, but this is the current finalized update.'
      : 'I will keep you updated if anything changes, but the request is now in motion.';

    return [
      `Hi ${senderName},`,
      '',
      `I reviewed your note about "${email.subject}".`,
      internalNote,
      approvalNote,
      '',
      closingNote,
      '',
      `Best,`,
      employee.name,
      employee.position,
    ].join('\n');
  }

  private draftEmail(employee: EmployeeRuntimeRecord) {
    const email = employee.currentEmail;
    if (!email) {
      this.logAgentEvent(employee, 'Email Draft Skipped', 'No current inbox email was attached to this draft action.');
      return;
    }

    const body = this.composeEmailDraft(employee, email);
    employee.draftedEmailBody = body;
    this.vault.appendPrivateNote({
      employeeName: employee.name,
      title: `Draft reply - ${email.subject}`,
      summary: `Drafted reply to ${email.from}.`,
      details: body,
      tags: ['draft', 'email'],
    });
    this.refreshVaultContext();
    this.logAgentEvent(employee, 'Email Drafted', `Drafted email reply for "${email.subject}".`);
    this.syncLiveMemory(employee);
  }

  private sendEmail(employee: EmployeeRuntimeRecord) {
    const email = employee.currentEmail;
    if (!email) {
      this.logAgentEvent(employee, 'Email Send Skipped', 'No current inbox email was available to send.');
      return;
    }

    const body = this.composeEmailDraft(employee, email);
    this.vault.appendSentEmail({
      subject: `Re: ${email.subject}`,
      to: email.from,
      from: 'office@no-mans-ai.local',
      body,
      sentBy: employee.name,
      sourceEmailId: email.id,
    });
    this.vault.markInboxEmailProcessed(email);
    this.processedEmailIds.add(email.id);
    employee.draftedEmailBody = null;
    employee.currentEmail = null;
    this.persistState();
    this.logAgentEvent(employee, 'Email Sent', `Sent reply for "${email.subject}" to ${email.from}.`);
    this.syncLiveMemory(employee);
  }

  private enqueueLivePlan(employeeId: EmployeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee || !this.planner || employee.phase !== 'idle' || employee.currentPlan || employee.planning || this.status.state !== 'running') {
      return;
    }

    if (this.isPlannerCircuitOpen()) {
      this.refreshStatus(employee);
      return;
    }

    if (employee.plannerRetryAt > Date.now()) {
      return;
    }

    if (this.plannerQueue.includes(employeeId)) {
      return;
    }

    const alreadyQueuedOrBusy = this.plannerBusy || this.plannerQueue.length > 0;
    employee.planning = true;
    employee.status = alreadyQueuedOrBusy ? 'Queued for live plan' : `Waiting for ${this.meta.transport === 'proxy' ? 'proxy' : 'live'} plan`;
    employee.lastUpdatedAt = nowIso();
    this.plannerQueue.push(employeeId);
    void this.processPlannerQueue();
  }

  private clearPlannerQueueTimer() {
    if (!this.plannerQueueTimer) {
      return;
    }

    clearTimeout(this.plannerQueueTimer);
    this.plannerQueueTimer = null;
  }

  private schedulePlannerQueue(delayMs = 0) {
    if (this.plannerQueueTimer) {
      return;
    }

    this.plannerQueueTimer = setTimeout(() => {
      this.plannerQueueTimer = null;
      void this.processPlannerQueue();
    }, Math.max(0, delayMs));
  }

  private isPlannerCircuitOpen() {
    return this.plannerCircuitOpenUntil > Date.now();
  }

  private registerPlannerSuccess() {
    this.plannerFailureStreak = 0;
    this.plannerCircuitOpenUntil = 0;
  }

  private registerPlannerFailure(error: unknown) {
    this.plannerFailureStreak += 1;
    if (this.plannerFailureStreak < PLANNER_CIRCUIT_BREAKER_THRESHOLD) {
      return;
    }

    const cooldownMs = Math.max(15_000, PLANNER_CIRCUIT_BREAKER_COOLDOWN_MS);
    const nextOpenUntil = Date.now() + cooldownMs;
    if (nextOpenUntil <= this.plannerCircuitOpenUntil) {
      return;
    }

    this.plannerCircuitOpenUntil = nextOpenUntil;
    this.plannerNextAvailableAt = Math.max(this.plannerNextAvailableAt, nextOpenUntil);
    this.pushSystemLog(
      `Planner circuit opened for ${Math.ceil(cooldownMs / 1000)}s after ${this.plannerFailureStreak} consecutive failures: ${shortError(error)}.`,
    );
  }

  private async processPlannerQueue() {
    if (this.plannerBusy || !this.planner || this.status.state !== 'running') {
      return;
    }

    if (this.isPlannerCircuitOpen()) {
      this.schedulePlannerQueue(this.plannerCircuitOpenUntil - Date.now());
      return;
    }

    const waitMs = this.plannerNextAvailableAt - Date.now();
    if (waitMs > 0) {
      this.schedulePlannerQueue(waitMs);
      return;
    }

    const employeeId = this.plannerQueue.shift();
    if (!employeeId) {
      return;
    }

    const employee = this.employees.get(employeeId);
    if (!employee) {
      void this.processPlannerQueue();
      return;
    }

    if (employee.phase !== 'idle' || employee.currentPlan) {
      employee.planning = false;
      this.refreshStatus(employee);
      void this.processPlannerQueue();
      return;
    }

    const pendingInbox = this.pendingInboxEmails();
    if (pendingInbox.length > 0 && !canHandleInbox(employee)) {
      employee.planning = false;
      this.refreshStatus(employee);
      void this.processPlannerQueue();
      return;
    }

    this.plannerBusy = true;
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
      current.plannerRetryAt = 0;
      current.lastUpdatedAt = nowIso();
      this.registerPlannerSuccess();

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
      this.registerPlannerFailure(error);
      current.plannerRetryAt = Date.now() + Math.max(1_000, PLANNER_RETRY_BACKOFF_MS);
      this.pushSystemLog(`Live planner failed for ${current.name}: ${shortError(error)}. Retrying after backoff.`);
      this.refreshStatus(current);
      this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    } finally {
      this.plannerBusy = false;
      this.plannerNextAvailableAt = Date.now() + Math.max(0, PLANNER_MIN_REQUEST_GAP_MS);
      if (PLANNER_MIN_REQUEST_GAP_MS > 0) {
        this.schedulePlannerQueue(PLANNER_MIN_REQUEST_GAP_MS);
      } else {
        void this.processPlannerQueue();
      }
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

    if (this.tickCount % MEMORY_CONSOLIDATION_INTERVAL === 0) {
      this.consolidateMemories();
    }

    this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
  }

  private advanceEmployee(employee: EmployeeRuntimeRecord) {
    if (employee.phase !== 'waiting' && this.maybeInterruptForPriorityWork(employee)) {
      return;
    }

    if (employee.phase === 'moving') {
      if (!employee.targetLocationId) {
        employee.phase = 'idle';
        this.refreshStatus(employee);
        return;
      }

      employee.movementTicksRemaining = Math.max(0, employee.movementTicksRemaining - 1);
      if (employee.movementTicksRemaining <= 0) {
        const arrivalLocationId = employee.targetLocationId;
        employee.currentLocationId = arrivalLocationId;
        employee.targetLocationId = null;
        employee.phase = 'working';
        employee.planVersion += 1;
        employee.lastUpdatedAt = nowIso();
        this.refreshStatus(employee);
        this.pushSystemLog(`${employee.name} arrived at ${locationLabel(arrivalLocationId)} for ${employee.taskTitle}.`);
        return;
      }

      employee.status = `Walking to ${locationLabel(employee.targetLocationId)}`;
      employee.lastUpdatedAt = nowIso();
      return;
    }

    if (employee.phase === 'waiting') {
      this.checkWaitingAction(employee);
      return;
    }

    if (employee.phase === 'working') {
      this.advanceWork(employee);
      return;
    }

    if (employee.phase !== 'idle') {
      return;
    }

    if (employee.plannerRetryAt > Date.now()) {
      this.refreshStatus(employee);
      employee.lastUpdatedAt = nowIso();
      return;
    }

    if (employee.plannerRetryAt > 0) {
      employee.plannerRetryAt = 0;
    }

    if (employee.planning) {
      employee.status = `Waiting for ${this.meta.transport === 'proxy' ? 'proxy' : 'live'} plan`;
      return;
    }

    const inbound = this.nextPendingRequestFor(employee.id);
    if (inbound) {
      if (this.planner) {
        this.enqueueLivePlan(employee.id);
      } else {
        this.applyPlan(employee, buildRequestHandlingPlan(employee, inbound), false);
      }
      return;
    }

    if (this.pendingInboxEmails().length > 0 && !canHandleInbox(employee)) {
      employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
      employee.lastUpdatedAt = nowIso();
      return;
    }

    if (roleBacklogBoost(employee, this.countOverflowRequests())) {
      if (this.planner) {
        this.enqueueLivePlan(employee.id);
      } else {
        this.applyPlan(employee, buildSupportPlan(employee), false);
      }
      return;
    }

    if (this.planner) {
      this.enqueueLivePlan(employee.id);
      return;
    }

    const plans = defaultPlansFor(employee);
    this.applyPlan(employee, randomFrom(plans), false);
  }

  private maybeInterruptForPriorityWork(employee: EmployeeRuntimeRecord) {
    const currentPlan = employee.currentPlan;
    const canInterrupt = !currentPlan || (currentPlan.source !== 'request' && currentPlan.source !== 'test');
    if (!canInterrupt) {
      return false;
    }

    const inbound = this.nextPendingRequestFor(employee.id);
    if (inbound) {
      if (currentPlan) {
        this.abandonCurrentPlan(employee, `Priority request from ${this.employees.get(inbound.fromId)?.name ?? inbound.fromId}`);
      }
      if (this.planner) {
        this.enqueueLivePlan(employee.id);
      } else {
        this.applyPlan(employee, buildRequestHandlingPlan(employee, inbound), false);
      }
      return true;
    }

    if (canHandleInbox(employee)) {
      const email = this.pendingInboxEmails()[0];
      const alreadyHandlingEmail = Boolean(employee.currentEmail) || currentPlan?.actions.some((action) =>
        action.type === 'review_email' || action.type === 'draft_email' || action.type === 'send_email',
      );
      if (email && !alreadyHandlingEmail) {
        if (currentPlan) {
          this.abandonCurrentPlan(employee, `Priority inbox item "${email.subject}"`);
        }
        if (this.planner) {
          this.enqueueLivePlan(employee.id);
        } else {
          this.applyPlan(employee, buildEmailHandlingPlan(employee, email), false);
        }
        return true;
      }
    }

    return false;
  }

  private abandonCurrentPlan(employee: EmployeeRuntimeRecord, reason: string) {
    const abandonedTitle = employee.taskTitle;
    employee.currentPlan = null;
    employee.currentActionIndex = 0;
    employee.targetLocationId = null;
    employee.movementTicksRemaining = 0;
    employee.phase = 'idle';
    employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
    employee.lastUpdatedAt = nowIso();
    employee.planVersion += 1;
    this.logAgentEvent(employee, 'Plan Interrupted', `${reason}\n\nInterrupted plan: ${abandonedTitle}`);
    this.pushSystemLog(`${employee.name} interrupted "${abandonedTitle}" to handle priority work.`);
  }

  private advanceWork(employee: EmployeeRuntimeRecord) {
    const action = this.currentAction(employee);
    if (!action) {
      this.completePlan(employee);
      return;
    }

    if (action.status === 'waiting') {
      employee.phase = 'waiting';
      this.checkWaitingAction(employee);
      return;
    }

    if (action.locationId !== employee.currentLocationId) {
      this.beginMove(employee, action.locationId);
      return;
    }

    switch (action.type) {
      case 'ask_permission':
      case 'request_review':
      case 'second_opinion':
        this.createRequestForAction(employee, action);
        return;
      case 'resolve_request':
        this.workOnAction(employee, action, () => this.resolveRequestForEmployee(employee, action));
        return;
      case 'escalate_terminal':
        this.workOnAction(employee, action, () => this.escalateToTerminal(employee, action));
        return;
      case 'read_private_notes':
      case 'read_archives':
      case 'review_email':
      case 'draft_email':
      case 'send_email':
      case 'fetch_context':
      case 'investigate':
      case 'desk_work':
      case 'report_back':
      case 'archive_note':
      default:
        this.workOnAction(employee, action, () => this.completeStandardAction(employee, action));
        return;
    }
  }

  private workOnAction(employee: EmployeeRuntimeRecord, action: OfficeAction, onComplete: () => void) {
    action.ticksWorked += 1;
    employee.status = `${labelForActionType(action.type)}: ${action.label}`;
    employee.lastUpdatedAt = nowIso();

    if (action.ticksWorked < action.durationTicks) {
      return;
    }

    onComplete();
  }

  private completeStandardAction(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    action.status = 'done';
    action.ticksWorked = action.durationTicks;
    employee.lastUpdatedAt = nowIso();

    if (action.type === 'investigate') {
      employee.performance.investigations += 1;
    }

    const memoryKind: MemoryKind =
      action.type === 'archive_note'
        ? 'task'
        : action.type === 'report_back'
          ? 'review'
          : action.type === 'fetch_context' || action.type === 'read_private_notes' || action.type === 'read_archives'
            ? 'context'
            : action.type === 'review_email' || action.type === 'draft_email' || action.type === 'send_email'
              ? 'task'
              : 'task';

    if (action.type === 'read_private_notes') {
      this.readPrivateDeskNotes(employee);
    } else if (action.type === 'read_archives') {
      this.readArchiveMaterials(employee);
    } else if (action.type === 'review_email') {
      this.reviewInboxEmail(employee, action);
    } else if (action.type === 'draft_email') {
      this.draftEmail(employee);
    } else if (action.type === 'send_email') {
      this.sendEmail(employee);
    } else if (action.type === 'archive_note') {
      this.archiveKnowledge(employee, action);
    }

    this.addMemory(employee.id, memoryKind, `${employee.name} completed "${action.label}".`, {
      referenceId: employee.currentPlan?.id ?? null,
      relatedLocationId: action.locationId,
      relatedEmployeeId: action.counterpartId,
      importance: action.type === 'investigate' ? 2 : 1,
    });

    this.pushSystemLog(`${employee.name} completed: ${action.label}.`);
    this.advanceToNextAction(employee);
  }

  private createRequestForAction(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    if (action.requestId) {
      action.status = 'waiting';
      employee.phase = 'waiting';
      this.refreshStatus(employee);
      return;
    }

    const counterpartId = action.counterpartId ?? defaultCounterpartForAction(employee, action.type);
    if (!counterpartId) {
      action.status = 'done';
      this.advanceToNextAction(employee);
      return;
    }

    const requestKind = action.requestKind ?? requestKindForAction(action.type) ?? 'review';
    const request: OfficeRequest = {
      id: randomUUID(),
      kind: requestKind,
      title: action.label,
      details: action.notes ?? `${employee.position} needs ${requestKind.replace('_', ' ')} on ${action.label.toLowerCase()}.`,
      fromId: employee.id,
      toId: counterpartId,
      locationId: action.locationId,
      status: 'pending',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      decisionSummary: null,
    };

    this.requests.set(request.id, request);
    action.requestId = request.id;
    action.status = 'waiting';
    employee.phase = 'waiting';
    employee.planVersion += 1;
    employee.lastUpdatedAt = nowIso();
    this.refreshStatus(employee);

    const counterpart = this.employees.get(counterpartId);
    if (counterpart) {
      counterpart.planVersion += 1;
      counterpart.lastUpdatedAt = nowIso();
      this.addMemory(counterpart.id, 'context', `${employee.name} requested ${request.kind} on "${request.title}".`, {
        referenceId: request.id,
        relatedEmployeeId: employee.id,
        relatedLocationId: request.locationId,
        importance: 2,
      });
    }

    this.addMemory(employee.id, 'approval', `${employee.name} requested ${request.kind} from ${counterpart?.name ?? counterpartId}.`, {
      referenceId: request.id,
      relatedEmployeeId: counterpartId,
      relatedLocationId: request.locationId,
      importance: 2,
    });

    this.logAgentEvent(
      employee,
      'Request Created',
      `Opened a ${request.kind} request titled "${request.title}" for ${counterpart?.name ?? counterpartId} at ${locationLabel(request.locationId)}.\n\n${request.details}`,
    );
    this.storeLongTermMemory(employee, {
      title: `${request.title} request`,
      summary: `Asked ${counterpart?.name ?? counterpartId} for ${request.kind}.`,
      details: `Request type: ${request.kind}\nCounterpart: ${counterpart?.name ?? counterpartId}\nLocation: ${locationLabel(request.locationId)}\n\n${request.details}`,
      kind: request.kind === 'approval' ? 'approval' : 'review',
      tags: [request.kind, 'request', slugify(request.title)],
      importance: 2,
      referenceId: request.id,
      relatedEmployeeId: counterpartId,
      relatedLocationId: request.locationId,
    });
    this.pushSystemLog(`${employee.name} requested ${request.kind} from ${counterpart?.name ?? counterpartId}.`);
    this.syncLiveMemory(employee);
    if (counterpart) {
      this.syncLiveMemory(counterpart);
    }
  }

  private resolveRequestForEmployee(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    const requestId = action.notes ?? action.requestId ?? null;
    if (!requestId) {
      action.status = 'done';
      this.advanceToNextAction(employee);
      return;
    }

    const request = this.requests.get(requestId);
    if (!request) {
      action.status = 'done';
      this.advanceToNextAction(employee);
      return;
    }

    const decision = this.decideRequestOutcome(employee, request);
    request.status = decision.approved ? 'approved' : 'rejected';
    request.updatedAt = nowIso();
    request.decisionSummary = decision.summary;

    if (request.kind === 'approval') {
      employee.performance.approvalsGiven += 1;
    }
    employee.lastUpdatedAt = nowIso();
    employee.planVersion += 1;
    action.status = 'done';

    const requester = this.employees.get(request.fromId);
    if (requester) {
      requester.lastUpdatedAt = nowIso();
      requester.planVersion += 1;
      if (decision.approved) {
        if (request.kind === 'approval') {
          requester.performance.approvalsReceived += 1;
          requester.performance.qualityScore = normalizeQualityScore(requester.performance.qualityScore + 0.02);
        } else {
          requester.performance.qualityScore = normalizeQualityScore(requester.performance.qualityScore + 0.01);
        }
      } else {
        requester.performance.reviewRejections += 1;
        requester.performance.corrections += 1;
        requester.performance.qualityScore = normalizeQualityScore(requester.performance.qualityScore - 0.08);
      }
      this.addMemory(requester.id, decision.approved ? 'review' : 'correction', decision.summary, {
        referenceId: request.id,
        relatedEmployeeId: employee.id,
        relatedLocationId: request.locationId,
        importance: decision.approved ? 2 : 3,
      });
    }

    this.addMemory(employee.id, 'review', `${employee.name} ${decision.approved ? 'approved' : 'rejected'} "${request.title}".`, {
      referenceId: request.id,
      relatedEmployeeId: request.fromId,
      relatedLocationId: request.locationId,
      importance: 2,
    });

    this.logAgentEvent(
      employee,
      decision.approved ? 'Request Approved' : 'Request Rejected',
      `${decision.summary}\n\nRequest: ${request.title}\nFrom: ${requester?.name ?? request.fromId}`,
    );
    this.storeLongTermMemory(employee, {
      title: `${request.title} decision`,
      summary: decision.summary,
      details: `Outcome: ${decision.approved ? 'approved' : 'rejected'}\nRequest: ${request.title}\nFrom: ${requester?.name ?? request.fromId}\nKind: ${request.kind}`,
      kind: decision.approved ? 'review' : 'correction',
      tags: [request.kind, decision.approved ? 'approved' : 'rejected', slugify(request.title)],
      importance: decision.approved ? 2 : 3,
      referenceId: request.id,
      relatedEmployeeId: request.fromId,
      relatedLocationId: request.locationId,
    });

    if (!decision.approved && request.kind === 'approval' && REDUCED_ROSTER_TEST_MODE) {
      this.createTerminalItem(employee.id, 'Owner review required', decision.summary, 'high', 'red-terminal');
    }

    this.syncLiveMemory(employee);
    if (requester) {
      this.syncLiveMemory(requester);
    }

    if (!decision.approved && requester && request.kind === 'approval') {
      this.proposePlaybookGap(
        requester,
        `${requester.position} exception handling gap: ${request.title}`,
        `${decision.summary}\n\nRejected ${request.kind} request from ${requester.name} to ${employee.name}.`,
      );
    }

    this.pushSystemLog(`${employee.name} ${decision.approved ? 'approved' : 'rejected'} ${request.kind} request "${request.title}".`);
    this.advanceToNextAction(employee);
  }

  private decideRequestOutcome(employee: EmployeeRuntimeRecord, request: OfficeRequest) {
    const requester = this.employees.get(request.fromId);
    const requesterScore = requester?.performance.qualityScore ?? 1;
    const needsOwnerJudgment =
      /owner|red terminal|human judgment|legal|lawsuit|fraud|chargeback|policy conflict/i.test(request.title) ||
      /owner|red terminal|human judgment|legal|lawsuit|fraud|chargeback|policy conflict/i.test(request.details);

    if (request.kind === 'review') {
      const caution =
        requesterScore < 0.72 || (requester?.performance.reviewRejections ?? 0) >= 2
          ? ' I have concerns, so tighten the packet before the final push.'
          : '';
      return {
        approved: true,
        summary: `${employee.name} reviewed the work and sent back advisory feedback.${caution}`,
      };
    }

    if (request.kind === 'second_opinion') {
      const emphasis = requester?.department === 'service' ? 'customer-facing' : 'current';
      return {
        approved: true,
        summary: `${employee.name} provided a second opinion and agreed with the ${emphasis} path, with any concerns noted in context.`,
      };
    }

    if (request.kind === 'approval') {
      if (!REDUCED_ROSTER_TEST_MODE && employee.id !== primaryCoverageEmployeeId) {
        return {
          approved: true,
          summary: `${employee.name} noted this approval request, but final authority sits with the General Manager.`,
        };
      }

      if (needsOwnerJudgment) {
        return {
          approved: false,
          summary: `${employee.name} stopped the approval because this needs Red Terminal / owner judgment before anything leaves the office.`,
        };
      }

      if (requesterScore < 0.58) {
        return {
          approved: false,
          summary: `${employee.name} rejected the approval because the packet is still too weak to send out. Tighten the work and resubmit.`,
        };
      }

      return {
        approved: true,
        summary: `${employee.name} approved the final push under the current playbook.`,
      };
    }

    return {
      approved: true,
      summary: `${employee.name} completed the ${request.kind} request under the current playbook.`,
    };
  }

  private escalateToTerminal(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    this.createTerminalItem(
      employee.id,
      action.label,
      action.notes ?? `${employee.name} escalated an office issue that needs human judgment.`,
      employee.department === 'management' ? 'high' : 'normal',
      action.locationId,
    );

    action.status = 'done';
    employee.lastUpdatedAt = nowIso();
    this.addMemory(employee.id, 'escalation', `${employee.name} escalated "${action.label}" to the Red Terminal.`, {
      relatedLocationId: action.locationId,
      importance: 3,
    });
    this.storeLongTermMemory(employee, {
      title: action.label,
      summary: `Escalated to the Red Terminal from ${locationLabel(action.locationId)}.`,
      details: action.notes ?? `${employee.name} escalated an office issue that needed owner judgment.`,
      kind: 'escalation',
      tags: ['terminal', 'escalation', slugify(action.label)],
      importance: 3,
      relatedLocationId: action.locationId,
    });
    this.pushSystemLog(`${employee.name} escalated "${action.label}" to the Red Terminal.`);
    this.syncLiveMemory(employee);
    this.advanceToNextAction(employee);
  }

  private createTerminalItem(
    fromId: EmployeeId,
    title: string,
    summary: string,
    priority: TerminalPriority,
    locationId: OfficeLocationId,
  ) {
    const item: TerminalItem = {
      id: randomUUID(),
      title,
      summary,
      fromId,
      priority,
      status: 'open',
      locationId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    this.terminalItems.set(item.id, item);
    const employee = this.employees.get(fromId);
    if (employee) {
      employee.performance.escalations += 1;
      employee.planVersion += 1;
      this.logAgentEvent(
        employee,
        'Red Terminal Escalation',
        `Escalated "${title}" to the Red Terminal with ${priority} priority.\n\n${summary}`,
      );
      if (priority === 'high' || priority === 'critical') {
        this.proposePlaybookGap(employee, `Escalation pattern: ${title}`, summary);
      }
    }
    this.vault.appendTerminalEvent({
      title,
      summary,
      fromEmployee: employee?.name ?? fromId,
      priority,
    });
    this.refreshVaultContext();
    this.persistState();
  }

  private checkWaitingAction(employee: EmployeeRuntimeRecord) {
    const action = this.currentAction(employee);
    if (!action || action.status !== 'waiting') {
      employee.phase = employee.targetLocationId ? 'moving' : 'working';
      this.refreshStatus(employee);
      return;
    }

    const request = action.requestId ? this.requests.get(action.requestId) : null;
    const counterpartName = action.counterpartId ? this.employees.get(action.counterpartId)?.name ?? action.counterpartId : 'office';
    employee.status = `Waiting on ${counterpartName}`;
    employee.lastUpdatedAt = nowIso();

    if (!request || request.status === 'pending') {
      employee.phase = 'waiting';
      return;
    }

    if (request.status === 'approved') {
      request.status = 'fulfilled';
      request.updatedAt = nowIso();
      action.status = 'done';
      employee.phase = 'working';
      employee.planVersion += 1;
      this.addMemory(employee.id, 'approval', `${employee.name} received approval on "${request.title}".`, {
        referenceId: request.id,
        relatedEmployeeId: request.toId,
        relatedLocationId: request.locationId,
        importance: 2,
      });
      this.pushSystemLog(`${employee.name} received approval on "${request.title}".`);
      this.advanceToNextAction(employee);
      return;
    }

    if (request.status === 'rejected') {
      request.status = 'escalated';
      request.updatedAt = nowIso();
      action.status = 'done';
      employee.phase = 'working';
      employee.planVersion += 1;
      this.insertCorrectionLoop(employee, action);
      this.pushSystemLog(`${employee.name} needs a correction pass after "${request.title}" was rejected.`);
      this.advanceToNextAction(employee, false);
      return;
    }
  }

  private insertCorrectionLoop(employee: EmployeeRuntimeRecord, action: OfficeAction) {
    const plan = employee.currentPlan;
    if (!plan) {
      return;
    }

    const correctionLocation = employee.assignedLocationId;
    const correction = buildAction('desk_work', correctionLocation, `Correct ${action.label.toLowerCase()}`, {
      notes: 'Review feedback incorporated into the next pass.',
      durationTicks: 2,
    });
    const followUpType = action.type === 'ask_permission' ? 'ask_permission' : action.type === 'second_opinion' ? 'second_opinion' : 'request_review';
    const followUp = buildAction(followUpType, action.locationId, `Resubmit ${action.label.toLowerCase()}`, {
      counterpartId: action.counterpartId,
      requestKind: action.requestKind,
    });

    plan.actions.splice(employee.currentActionIndex + 1, 0, correction, followUp);
  }

  private applyPlan(employee: EmployeeRuntimeRecord, plan: TaskPlan, scripted: boolean) {
    const guardedPlan = applyPlaybookGuardrails(employee, plan);
    employee.planning = false;
    employee.plannerRetryAt = 0;
    employee.currentPlan = guardedPlan;
    employee.currentActionIndex = 0;
    employee.taskTitle = guardedPlan.title;
    employee.objective = guardedPlan.objective;
    employee.lastUpdatedAt = nowIso();
    employee.planVersion += 1;

    const firstAction = guardedPlan.actions[0];
    if (!firstAction) {
      this.completePlan(employee);
      return;
    }

    this.addMemory(employee.id, 'task', `${employee.name} started "${guardedPlan.title}".`, {
      referenceId: guardedPlan.id,
      relatedLocationId: firstAction.locationId,
      importance: 2,
    });

    this.pushSystemLog(
      scripted
        ? `${employee.name} received scripted test plan "${guardedPlan.title}".`
        : `${employee.name} started plan "${guardedPlan.title}".`,
    );
    this.logAgentEvent(
      employee,
      scripted ? 'Scripted Plan Started' : 'Plan Started',
      `Objective: ${guardedPlan.objective}\n\nChecklist:\n${serializeChecklist(guardedPlan).map((item) => `- ${item}`).join('\n')}`,
    );
    this.syncLiveMemory(employee);

    if (firstAction.locationId === employee.currentLocationId) {
      employee.targetLocationId = null;
      employee.movementTicksRemaining = 0;
      employee.phase = firstAction.status === 'waiting' ? 'waiting' : 'working';
      this.refreshStatus(employee);
      return;
    }

    this.beginMove(employee, firstAction.locationId);
  }

  private beginMove(employee: EmployeeRuntimeRecord, targetLocationId: OfficeLocationId) {
    employee.targetLocationId = targetLocationId;
    employee.movementTicksRemaining = estimateMovementTicks(employee.currentLocationId, targetLocationId);
    employee.phase = 'moving';
    employee.planVersion += 1;
    employee.status = `Walking to ${locationLabel(targetLocationId)}`;
    employee.lastUpdatedAt = nowIso();
    this.pushSystemLog(`${employee.name} heads to ${locationLabel(targetLocationId)} for ${employee.taskTitle}.`);
  }

  private advanceToNextAction(employee: EmployeeRuntimeRecord, pushStatus = true) {
    const plan = employee.currentPlan;
    if (!plan) {
      this.completePlan(employee);
      return;
    }

    const nextIndex = plan.actions.findIndex((action, index) => index > employee.currentActionIndex && action.status !== 'done');
    if (nextIndex === -1) {
      this.completePlan(employee);
      return;
    }

    employee.currentActionIndex = nextIndex;
    employee.lastUpdatedAt = nowIso();
    employee.planVersion += 1;

    const nextAction = plan.actions[nextIndex];
    if (nextAction.locationId !== employee.currentLocationId) {
      this.syncLiveMemory(employee);
      this.beginMove(employee, nextAction.locationId);
      return;
    }

    employee.phase = nextAction.status === 'waiting' ? 'waiting' : 'working';
    this.syncLiveMemory(employee);
    if (pushStatus) {
      this.refreshStatus(employee);
    }
  }

  private completePlan(employee: EmployeeRuntimeRecord) {
    const finishedTitle = employee.taskTitle;
    const finishedPlan = employee.currentPlan;
    employee.currentPlan = null;
    employee.currentActionIndex = 0;
    employee.targetLocationId = null;
    employee.movementTicksRemaining = 0;
    employee.phase = 'idle';
    employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
    employee.lastUpdatedAt = nowIso();
    employee.planVersion += 1;
    employee.performance.completedPlans += 1;
    employee.performance.qualityScore = normalizeQualityScore(employee.performance.qualityScore + 0.01);

    this.addMemory(employee.id, 'task', `${employee.name} completed "${finishedTitle}".`, {
      relatedLocationId: employee.currentLocationId,
      importance: 2,
    });
    if (finishedPlan && finishedPlan.source !== 'test') {
      this.maybeProposePlaybookPattern(employee, finishedTitle);
    }
    this.storeLongTermMemory(employee, {
      title: finishedTitle,
      summary: `Completed at ${locationLabel(employee.currentLocationId)}.`,
      details: [
        `Objective: ${employee.objective}`,
        finishedPlan ? `Final checklist:\n${serializeChecklist(finishedPlan).map((item) => `- ${item}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      kind: 'task',
      tags: ['plan-complete', slugify(finishedTitle)],
      importance: 2,
      referenceId: finishedPlan?.id ?? null,
      relatedLocationId: employee.currentLocationId,
    });
    this.logAgentEvent(
      employee,
      'Plan Completed',
      `Completed "${finishedTitle}" at ${locationLabel(employee.currentLocationId)}.${finishedPlan ? `\n\nFinal checklist:\n${serializeChecklist(finishedPlan).map((item) => `- ${item}`).join('\n')}` : ''}`,
    );
    this.syncLiveMemory(employee);
    this.persistState();
    this.pushSystemLog(`${employee.name} completed ${finishedTitle}.`);
  }

  private refreshStatus(employee: EmployeeRuntimeRecord) {
    if (employee.planning) {
      employee.status = `Waiting for ${this.meta.transport === 'proxy' ? 'proxy' : 'live'} plan`;
      return;
    }

    if (employee.phase === 'idle' && this.isPlannerCircuitOpen()) {
      const seconds = Math.max(1, Math.ceil((this.plannerCircuitOpenUntil - Date.now()) / 1000));
      employee.status = `Planner cooling down for ${seconds}s`;
      return;
    }

    if (employee.phase === 'idle' && employee.plannerRetryAt > Date.now()) {
      const seconds = Math.max(1, Math.ceil((employee.plannerRetryAt - Date.now()) / 1000));
      employee.status = `Retrying live plan in ${seconds}s`;
      return;
    }

    if (employee.phase === 'moving' && employee.targetLocationId) {
      employee.status = `Walking to ${locationLabel(employee.targetLocationId)}`;
      return;
    }

    if (employee.phase === 'waiting') {
      const action = this.currentAction(employee);
      const counterpart = action?.counterpartId ? this.employees.get(action.counterpartId)?.name ?? action.counterpartId : 'office';
      employee.status = `Waiting on ${counterpart}`;
      return;
    }

    if (employee.phase === 'working') {
      const action = this.currentAction(employee);
      employee.status = action ? `${labelForActionType(action.type)}: ${action.label}` : `Working ${employee.taskTitle}`;
      return;
    }

    employee.status = `Holding at ${locationLabel(employee.currentLocationId)}`;
  }

  private currentAction(employee: EmployeeRuntimeRecord) {
    return employee.currentPlan?.actions[employee.currentActionIndex] ?? null;
  }

  private remainingLocationQueue(employee: EmployeeRuntimeRecord) {
    if (!employee.currentPlan) {
      return [];
    }

    const locations: OfficeLocationId[] = [];
    const baselineLocation = employee.currentLocationId;
    for (let index = employee.currentActionIndex; index < employee.currentPlan.actions.length; index += 1) {
      const action = employee.currentPlan.actions[index];
      if (action.status === 'done') {
        continue;
      }
      if (locations.length === 0 && action.locationId === baselineLocation) {
        continue;
      }
      if (locations.at(-1) !== action.locationId) {
        locations.push(action.locationId);
      }
    }

    return locations;
  }

  private addMemory(
    employeeId: EmployeeId,
    kind: MemoryKind,
    summary: string,
    options?: {
      referenceId?: string | null;
      relatedLocationId?: OfficeLocationId | null;
      relatedEmployeeId?: EmployeeId | null;
      importance?: number;
    },
  ) {
    const employee = this.employees.get(employeeId);
    if (!employee) {
      return;
    }

    employee.activeMemory.push(
      createMemoryItem(kind, summary, {
        referenceId: options?.referenceId,
        relatedLocationId: options?.relatedLocationId,
        relatedEmployeeId: options?.relatedEmployeeId,
        importance: options?.importance,
      }),
    );

    while (employee.activeMemory.length > ACTIVE_MEMORY_LIMIT) {
      const demoted = employee.activeMemory.shift();
      if (demoted) {
        demoted.tier = 'passive';
        employee.passiveMemory.push(demoted);
      }
    }

    if (employee.passiveMemory.length > PASSIVE_MEMORY_LIMIT) {
      employee.passiveMemory = employee.passiveMemory.slice(-PASSIVE_MEMORY_LIMIT);
    }

    this.persistState();
  }

  private consolidateMemories() {
    for (const employee of this.employees.values()) {
      const keepActive = employee.activeMemory
        .slice()
        .sort((left, right) => right.importance - left.importance || right.createdAt.localeCompare(left.createdAt))
        .slice(0, ACTIVE_MEMORY_LIMIT);
      const keepIds = new Set(keepActive.map((item) => item.id));
      const demoted = employee.activeMemory.filter((item) => !keepIds.has(item.id));

      for (const item of demoted) {
        item.tier = 'passive';
        employee.passiveMemory.push(item);
      }

      employee.activeMemory = keepActive.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      if (employee.passiveMemory.length > PASSIVE_MEMORY_LIMIT) {
        employee.passiveMemory = employee.passiveMemory.slice(-PASSIVE_MEMORY_LIMIT);
      }
    }

    this.persistState();
  }

  private requestSummariesForEmployee(employeeId: EmployeeId, direction: 'inbound' | 'outbound') {
    return [...this.requests.values()]
      .filter((request) => (direction === 'inbound' ? request.toId === employeeId : request.fromId === employeeId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 3)
      .map((request) => {
        const counterpartId = direction === 'inbound' ? request.fromId : request.toId;
        return {
          id: request.id,
          kind: request.kind,
          status: request.status,
          title: request.title,
          counterpartId,
          counterpartName: this.employees.get(counterpartId)?.name ?? counterpartId,
          updatedAt: request.updatedAt,
        };
      });
  }

  private recentTaskMemories(employee: EmployeeRuntimeRecord, limit = 8) {
    return [...employee.activeMemory, ...employee.passiveMemory]
      .filter((memory) => memory.kind === 'task' || memory.kind === 'context')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-limit);
  }

  private officeRecentTaskSummary(limit = 10) {
    return [...this.employees.values()]
      .flatMap((employee) =>
        this.recentTaskMemories(employee, Math.max(4, Math.ceil(limit / Math.max(1, this.employees.size)))).map((memory) => ({
          employeeName: employee.name,
          createdAt: memory.createdAt,
          summary: memory.summary,
        })),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-limit)
      .map((item) => `- ${item.employeeName}: ${item.summary}`);
  }

  private officeOpportunitySummary(limit = 5) {
    const knowledgeOpportunities = this.knowledgeSummaries
      .slice(0, limit)
      .map((item) => `- ${item.title}: ${item.summary}`);
    const terminalOpportunities = [...this.terminalItems.values()]
      .filter((item) => item.status === 'open')
      .slice(0, 3)
      .map((item) => `- ${item.title}: ${item.summary}`);

    const combined = [...terminalOpportunities, ...knowledgeOpportunities];
    return combined.length > 0 ? combined.slice(0, limit).join('\n') : '- none';
  }

  private buildLiveRequestResolutionPlan(
    employee: EmployeeRuntimeRecord,
    request: OfficeRequest,
    planPayload: { title: string; objective: string; actions: OfficeAction[] },
  ) {
    const fallbackPlan = buildRequestHandlingPlan(employee, request);
    const requesterName = this.employees.get(request.fromId)?.name ?? request.fromId;
    const filteredActions = planPayload.actions
      .filter((action) => action.type !== 'ask_permission' && action.type !== 'request_review' && action.type !== 'second_opinion')
      .map((action) => {
        if (action.type !== 'resolve_request') {
          return action;
        }

        return buildAction('resolve_request', employee.assignedLocationId, `Resolve ${request.kind} for ${requesterName}`, {
          counterpartId: request.fromId,
          notes: request.id,
        });
      });

    if (!filteredActions.some((action) => action.type === 'resolve_request')) {
      injectActionBeforeArchive(
        filteredActions,
        buildAction('resolve_request', employee.assignedLocationId, `Resolve ${request.kind} for ${requesterName}`, {
          counterpartId: request.fromId,
          notes: request.id,
        }),
      );
    }

    if (!filteredActions.some((action) => action.type === 'report_back')) {
      injectActionBeforeArchive(
        filteredActions,
        buildAction('report_back', request.locationId, `Send decision back to ${requesterName}`, {
          counterpartId: request.fromId,
        }),
      );
    }

    if (!filteredActions.some((action) => action.type === 'archive_note')) {
      filteredActions.push(buildAction('archive_note', 'archives', `Archive request notes for ${request.title}`));
    }

    const viableActions = filteredActions.length >= 3 ? filteredActions : fallbackPlan.actions;
    return buildPlan(
      planPayload.title.trim() || fallbackPlan.title,
      planPayload.objective.trim() || fallbackPlan.objective,
      viableActions,
      'request',
    );
  }

  private isLowValueSetupLoop(employee: EmployeeRuntimeRecord, planPayload: { title: string; objective: string; actions: OfficeAction[] }) {
    const hasUrgentTrigger =
      this.nextPendingRequestFor(employee.id) ||
      (canHandleInbox(employee) && this.pendingInboxEmails()[0]) ||
      [...this.terminalItems.values()].some((item) => item.status === 'open');
    if (hasUrgentTrigger) {
      return false;
    }

    const recentSummaries = this.recentTaskMemories(employee, 8).map((memory) => memory.summary.toLowerCase());
    const repeatedSetupRecently = recentSummaries.filter((summary) =>
      /leadership sync|review playbook|review playbook\/policies|review shared knowledge|review task board|archive operational notes|check personal notes/.test(summary),
    ).length >= 3;

    if (!repeatedSetupRecently) {
      return false;
    }

    const actionLabels = planPayload.actions.map((action) => action.label.toLowerCase());
    const setupActionCount = actionLabels.filter((label) =>
      /playbook|knowledge|task board|personal notes|leadership sync|archive operational notes|status update/.test(label),
    ).length;
    const substantiveActionCount = planPayload.actions.filter((action) =>
      action.type === 'investigate' ||
      action.type === 'desk_work' ||
      action.type === 'fetch_context' ||
      action.type === 'request_review' ||
      action.type === 'second_opinion' ||
      action.type === 'escalate_terminal',
    ).length;
    const repeatedTitle = recentSummaries.some((summary) =>
      normalizePlanFingerprint(summary).includes(normalizePlanFingerprint(planPayload.title)),
    );

    return (repeatedTitle || /workflow|prioritization|readiness|initialization/i.test(planPayload.title)) && setupActionCount >= 3 && substantiveActionCount <= 1;
  }

  private nextPendingRequestFor(employeeId: EmployeeId) {
    return [...this.requests.values()]
      .filter((request) => request.toId === employeeId && request.status === 'pending')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;
  }

  private countOverflowRequests() {
    const staffIds = [...this.employees.values()]
      .filter((employee) => employee.department === 'service' || employee.department === 'finance' || employee.department === 'it')
      .map((employee) => employee.id);
    const staffSet = new Set(staffIds);
    return [...this.requests.values()].filter((request) => staffSet.has(request.toId) && request.status === 'pending').length;
  }

  private resolvePlannerConfigForEmployee(employee: EmployeeRuntimeRecord) {
    if (!this.planner) {
      return null;
    }

    const useConfiguredModelOnly =
      isLoopbackBaseUrl(this.planner.baseUrl) || this.planner.model.includes(':') || !supportsRoleModel(this.planner.model);
    let chosenModel =
      !useConfiguredModelOnly && employee.preferredModel && supportsRoleModel(employee.preferredModel)
        ? employee.preferredModel
        : this.planner.model;

    // The current proxy stack reliably serves GPT-5.4/5.3, but will sometimes
    // answer gpt-4o-mini requests as gpt-5-mini, which trips strict model
    // matching and stalls the serial planner queue. Force proxy-safe models.
    if (!useConfiguredModelOnly && this.meta.transport === 'proxy' && !PROXY_SAFE_MODELS.has(chosenModel)) {
      chosenModel = PROXY_SAFE_MODELS.has(this.planner.model) ? this.planner.model : 'gpt-5.4';
    }

    const pricing =
      chosenModel === this.planner.model
        ? {
            inputCostPer1M: this.planner.inputCostPer1M,
            outputCostPer1M: this.planner.outputCostPer1M,
          }
        : defaultPricingForModel(chosenModel);

    return {
      ...this.planner,
      model: chosenModel,
      inputCostPer1M: pricing.inputCostPer1M,
      outputCostPer1M: pricing.outputCostPer1M,
    };
  }

  private async requestLivePlan(employeeId: EmployeeId) {
    const employee = this.employees.get(employeeId);
    if (
      !employee ||
      !this.planner ||
      employee.phase !== 'idle' ||
      employee.planning ||
      this.isPlannerCircuitOpen() ||
      employee.plannerRetryAt > Date.now() ||
      this.status.state !== 'running'
    ) {
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
      current.plannerRetryAt = 0;
      current.lastUpdatedAt = nowIso();
      this.registerPlannerSuccess();

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
      this.registerPlannerFailure(error);
      current.plannerRetryAt = Date.now() + Math.max(1_000, PLANNER_RETRY_BACKOFF_MS);
      this.pushSystemLog(`Live planner failed for ${current.name}: ${shortError(error)}. Retrying after backoff.`);
      this.refreshStatus(current);
      this.broadcast({ type: 'employees', payload: this.getEmployeeSnapshot() });
    }
  }

  private async requestOllamaStructuredOutput(
    planner: LivePlannerConfig,
    messages: Array<{ role: string; content: string }>,
    format: unknown,
    initialNumPredict: number,
    contextLabel: string,
    signal: AbortSignal,
  ) {
    const attempts = [initialNumPredict, Math.max(initialNumPredict * 2, 512)];
    let lastError: Error | null = null;

    for (const numPredict of attempts) {
      let responseText = '';
      let response: Response;
      try {
        response = await fetch(buildOllamaChatUrl(planner.baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: planner.model,
            messages,
            stream: false,
            think: false,
            format,
            options: {
              temperature: 0,
              num_predict: numPredict,
            },
          }),
          signal,
        });

        responseText = await response.text();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }

      if (!response.ok) {
        lastError = new Error(`${contextLabel} HTTP ${response.status} on ${planner.model}: ${responseText.slice(0, 220)}`);
        break;
      }

      let parsedResponse: OllamaChatResponse;
      try {
        parsedResponse = JSON.parse(responseText) as OllamaChatResponse;
      } catch {
        lastError = new Error(`${contextLabel} returned invalid JSON.`);
        break;
      }

      this.recordUsage(parsedResponse, planner.model);
      const assistantText = extractAssistantText(parsedResponse.message?.content).trim();
      if (assistantText) {
        return assistantText;
      }

      const doneReason = readOllamaDoneReason(parsedResponse) ?? 'unknown';
      const evalCount = readOllamaEvalCount(parsedResponse);
      const thinkingPreview = extractAssistantText(parsedResponse.message?.thinking).replace(/\s+/g, ' ').trim().slice(0, 140);
      lastError = new Error(
        doneReason === 'length' || evalCount >= numPredict
          ? `${contextLabel} truncated before JSON (done_reason=${doneReason}, eval_count=${evalCount}, num_predict=${numPredict}).`
          : `${contextLabel} returned empty content${thinkingPreview ? ` after thinking: ${thinkingPreview}` : ''}.`,
      );

      if (doneReason !== 'length' && evalCount < numPredict) {
        break;
      }
    }

    throw lastError ?? new Error(`${contextLabel} returned no structured content.`);
  }

  private async fetchLiveEmailStrategy(employee: EmployeeRuntimeRecord, email: VaultEmail): Promise<EmailHandlingStrategy> {
    const planner = this.resolvePlannerConfigForEmployee(employee);
    if (!planner) {
      return classifyInboxEmail(email);
    }

    this.refreshEmployeeMemoryWorkspace(employee);
    const fallback = classifyInboxEmail(email);
    const activeMemory = employee.activeMemory.slice(-4).map((item) => `- ${item.summary}`).join('\n');
    const liveMemory = employee.liveMemory
      ? [
          `Focus: ${employee.liveMemory.focus}`,
          `Objective: ${employee.liveMemory.objective}`,
          `Checklist: ${employee.liveMemory.checklist.join(' | ') || 'none'}`,
          `Open loops: ${employee.liveMemory.openLoops.join(' | ') || 'none'}`,
        ].join('\n')
      : '- none';
    const personalMemory =
      employee.privateNotes.length > 0 ? employee.privateNotes.slice(0, 5).map((note) => `- ${note.title}: ${note.summary}`).join('\n') : '- none';
    const pendingApprovals = this.requestSummariesForEmployee(employee.id, 'outbound')
      .map((request) => `- ${request.kind}: ${request.title} (${request.status})`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: [
          'You are the inbox strategist for a small-business virtual office.',
          'Return only the JSON object that matches the provided schema.',
          'Keep draftFocus short and concrete.',
          'Customer Relations owns the case. General Manager is the only internal approver. The Red Terminal / owner is above the General Manager.',
          'Quality Assurance is advisory only. React A, B, C, and D are a reaction team that can help when genuinely needed.',
          REDUCED_ROSTER_TEST_MODE ? REDUCED_ROSTER_NOTE : '',
          'Only include helpers if they materially improve the packet. Do not add React help to a pure finance/policy refund unless the case is genuinely cross-functional.',
          'If money, policy, repeat incidents, or precedent matter, set needsArchives to true so the agent walks to Archives before deciding.',
          'Set ownerEscalationLikely to true only if the issue appears to require true owner judgment, legal risk, fraud, or policy conflict.',
          `Allowed helper employee ids: ${employeeSeeds.map((seed) => seed.id).join(', ')}`,
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Employee: ${employee.name} (${employee.position})`,
          `Subject: ${email.subject}`,
          `From: ${email.from}`,
          `Summary: ${email.summary}`,
          `Body:\n${email.body}`,
          `Live memory:\n${liveMemory}`,
          `Personal long-term memory:\n${personalMemory}`,
          `Active memory:\n${activeMemory || '- none'}`,
          `Open outbound requests:\n${pendingApprovals || '- none'}`,
          'Pick the smallest useful collaboration pattern that still feels like a competent office.',
        ].join('\n'),
      },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PLANNER_REQUEST_TIMEOUT_MS);

    let responseText = '';
    let response: Response | null = null;
    try {
      if (usesOllamaNativeStructuredOutputs(planner)) {
        responseText = await this.requestOllamaStructuredOutput(
          planner,
          messages,
          OLLAMA_EMAIL_STRATEGY_SCHEMA,
          160,
          'Inbox strategy',
          controller.signal,
        );
      } else {
        response = await fetch(buildChatCompletionsUrl(planner.baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${planner.apiKey}`,
          },
          body: JSON.stringify({
            model: planner.model,
            temperature: 0.2,
            max_tokens: 220,
            messages,
          }),
          signal: controller.signal,
        });
        responseText = await response.text();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Inbox strategy timed out after ${PLANNER_REQUEST_TIMEOUT_MS}ms for ${employee.name} on ${planner.model}.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (response && !response.ok) {
      throw new Error(`Inbox strategy HTTP ${response.status} on ${planner.model}: ${responseText.slice(0, 220)}`);
    }

    let payload: LiveEmailStrategyPayload;
    if (usesOllamaNativeStructuredOutputs(planner)) {
      payload = extractJsonObject(responseText) as LiveEmailStrategyPayload;
    } else {
      let parsedResponse: PlannerChatResponse;
      try {
        parsedResponse = JSON.parse(responseText) as PlannerChatResponse;
      } catch {
        throw new Error('Inbox strategy returned invalid JSON.');
      }

      this.recordUsage(parsedResponse.usage, planner.model);
      const assistantText = extractAssistantText(parsedResponse.choices?.[0]?.message?.content);
      payload = extractJsonObject(assistantText) as LiveEmailStrategyPayload;
    }

    const conservativeSimpleCase = fallback.complexity === 'simple' && !fallback.archiveResearch && fallback.helpers.length === 0;
    const complexity = conservativeSimpleCase
      ? 'simple'
      : payload.complexity === 'simple' || payload.complexity === 'complex'
        ? payload.complexity
        : fallback.complexity;
    const helperIds = Array.isArray(payload.helperEmployeeIds)
      ? payload.helperEmployeeIds.filter((value): value is EmployeeId => typeof value === 'string' && employeeIdSet.has(value as EmployeeId))
      : [];
    const helpers = conservativeSimpleCase
      ? []
      : helperIds.length > 0
        ? dedupeEmailHelpers(helperIds.map((helperId) => emailHelperPlanFor(helperId)))
        : fallback.helpers;
    const draftFocus = typeof payload.draftFocus === 'string' && payload.draftFocus.trim() ? payload.draftFocus.trim().slice(0, 220) : fallback.draftFocus;

    return {
      complexity,
      archiveResearch: conservativeSimpleCase
        ? false
        : typeof payload.needsArchives === 'boolean'
          ? payload.needsArchives
          : fallback.archiveResearch,
      gmApprovalRequired: true,
      ownerEscalationLikely:
        conservativeSimpleCase
          ? false
          : typeof payload.ownerEscalationLikely === 'boolean'
            ? payload.ownerEscalationLikely
            : fallback.ownerEscalationLikely,
      helpers,
      draftFocus,
    };
  }

  private async fetchLivePlan(employee: EmployeeRuntimeRecord): Promise<TaskPlan> {
    const planner = this.resolvePlannerConfigForEmployee(employee);
    if (!planner) {
      throw new Error('Live planner is not configured.');
    }

    this.refreshEmployeeMemoryWorkspace(employee);
    const pendingRequest = this.nextPendingRequestFor(employee.id);
    const activeMemory = employee.activeMemory.slice(-4).map((item) => `- ${item.summary}`).join('\n');
    const recentTaskSummary = this.recentTaskMemories(employee, 6).map((item) => `- ${item.summary}`).join('\n');
    const officeRecentWork = this.officeRecentTaskSummary(8).join('\n');
    const officeOpportunities = this.officeOpportunitySummary(5);
    const inboundRequests = this.requestSummariesForEmployee(employee.id, 'inbound')
      .map((request) => `- ${request.kind}: ${request.title} (${request.status})`)
      .join('\n');
    const terminalSummary = [...this.terminalItems.values()]
      .filter((item) => item.status === 'open')
      .slice(0, 3)
      .map((item) => `- ${item.title}: ${item.summary}`)
      .join('\n');
    const liveMemory =
      employee.liveMemory
        ? [
            `Focus: ${employee.liveMemory.focus}`,
            `Objective: ${employee.liveMemory.objective}`,
            `Checklist: ${employee.liveMemory.checklist.join(' | ') || 'none'}`,
            `Open loops: ${employee.liveMemory.openLoops.join(' | ') || 'none'}`,
          ].join('\n')
        : '- none';
    const sharedKnowledge =
      employee.currentLocationId === 'archives'
        ? this.knowledgeSummaries
            .slice(0, 5)
            .map((item) => `- ${item.title}: ${item.summary}`)
            .join('\n')
        : '';
    const playbookRules =
      employee.currentLocationId === 'archives'
        ? this.playbookRules.map((rule) => `- ${rule.title}: ${rule.summary}`).join('\n')
        : '';
    const privateNotes =
      employee.currentLocationId === employee.assignedLocationId
        ? employee.privateNotes.slice(0, 5).map((note) => `- ${note.title}: ${note.summary}`).join('\n')
        : '';
    const pendingEmails =
      employee.department === 'service'
        ? this.pendingInboxEmails()
            .slice(0, 4)
            .map((email) => `- ${email.subject} from ${email.from}: ${email.summary}`)
            .join('\n')
        : '';

    const messages = [
      {
        role: 'system',
        content: [
          'You are the planner for a simulated virtual employee in a small-business office.',
          'Return only the JSON object that matches the provided schema.',
          'Use 3 to 5 actions.',
          'Keep output concise. Title under 10 words. Objective under 18 words. Each label under 8 words. Do not include explanations or time estimates.',
          'Plans must look like real office work: consult notes, investigate, ask peers for help when needed, get final permission only from the General Manager, then report or archive.',
          'Hierarchy: Red Terminal / owner is the highest authority. General Manager is the only internal approver. Everyone else is on an even playing field.',
          'Quality Assurance is advisory, not supervisory. React A, B, C, and D are a reaction team that can help any office workflow when free.',
          'War Room is a shared collaboration desk for multi-person strategy huddles when employees need to align before reporting back.',
          'Each agent only has access to their own memory workspace. Personal long-term memory is only accessible at the assigned desk. Use read_private_notes there to refresh live memory and search long-term memory.',
          'The Playbook and shared knowledge are only accessible in Archives. Use read_archives when policy or past precedent matters.',
          REDUCED_ROSTER_TEST_MODE ? REDUCED_ROSTER_NOTE : '',
          REDUCED_ROSTER_TEST_MODE
            ? 'If there is no urgent request or inbox work, first use free time like humans would: review the playbook, hold a leadership sync in the War Room, decide who is acting lead for the cycle, pick a worthwhile next task, and record a temporary coverage note in Archives.'
            : '',
          'After bootstrapping, move on to concrete work. Do not keep repeating startup rituals, task-board checks, or archive-only loops unless new information arrived.',
          'If a leadership sync already happened recently, use it as context and choose a concrete next initiative with a visible deliverable.',
          'Free time should become substantive work: investigate active projects, clean up process gaps, update the playbook with a real proposal, review client/project context, or produce a specific office improvement.',
          'Inbox email lives in the Email Simulator inbox. Customer Relations should review_email, draft_email, and send_email from the customer-relations desk.',
          'Simple customer emails can be handled solo, but the final outgoing send still needs General Manager approval.',
          'Complex customer emails should split work across helpers, gather second opinions or advisory reviews, then stitch the packet together before asking the General Manager for final approval.',
          'Use request_review and second_opinion for advisory collaboration. Use ask_permission only for General Manager final approval.',
          'Avoid reciprocal review loops. If the employee is already handling a review or approval context, resolve it instead of creating another review request back.',
          REDUCED_ROSTER_TEST_MODE ? 'Do not default to repetitive peer-review loops when there is no urgent work.' : '',
          'Do not ask Petra or any peer for final approval.',
          'If the General Manager needs true owner judgment, use escalate_terminal instead of ask_permission.',
          'If there is unresolved risk or owner judgment is needed, include escalate_terminal.',
          'If there are inbound requests or pending inbox emails, handle those before discretionary work unless something more urgent blocks progress.',
          pendingRequest
            ? 'There is a pending inbound request that must be handled now. The plan must resolve it directly. Do not open new review, second-opinion, or approval loops while handling this request unless owner escalation is truly required.'
            : '',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Employee: ${employee.name}`,
          `Position: ${employee.position}`,
          `Department: ${employee.department}`,
          `Assigned location: ${employee.assignedLocationId} (${locationLabel(employee.assignedLocationId)})`,
          `Current location: ${employee.currentLocationId} (${locationLabel(employee.currentLocationId)})`,
          `Chain of command: ${REDUCED_ROSTER_TEST_MODE ? 'Sam and Jeremy are temporarily sharing office coverage and may sign off for one another when needed.' : employee.id === primaryCoverageEmployeeId ? 'Red Terminal / owner above General Manager' : `General Manager above ${employee.position}; peers are otherwise equal`}`,
          `Bio: ${employee.bio}`,
          `Default checklist: ${employee.defaultChecklist.join('; ')}`,
          `Live memory:\n${liveMemory}`,
          `Personal long-term memory:\n${privateNotes || '- unavailable until you are at your assigned desk'}`,
          `Playbook rules from Archives:\n${playbookRules || '- unavailable until you are in Archives'}`,
          `Shared knowledge from Archives:\n${sharedKnowledge || '- unavailable until you are in Archives'}`,
          `Active memory:\n${activeMemory || '- none'}`,
          `Your recent completed work:\n${recentTaskSummary || '- none'}`,
          `Recent office work:\n${officeRecentWork || '- none'}`,
          `Current office opportunities:\n${officeOpportunities}`,
          pendingRequest
            ? `Priority inbound request:\n- Kind: ${pendingRequest.kind}\n- Title: ${pendingRequest.title}\n- From: ${this.employees.get(pendingRequest.fromId)?.name ?? pendingRequest.fromId}\n- Details: ${pendingRequest.details}\n- Request id: ${pendingRequest.id}`
            : 'Priority inbound request:\n- none',
          `Inbound requests:\n${inboundRequests || '- none'}`,
          `Pending inbox emails:\n${pendingEmails || '- none'}`,
          `Open Red Terminal items:\n${terminalSummary || '- none'}`,
          'Generate the next coherent office plan. Prefer a concrete initiative with a visible outcome over another generic setup pass.',
        ].join('\n'),
      },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PLANNER_REQUEST_TIMEOUT_MS);

    let responseText = '';
    let response: Response | null = null;
    try {
      if (usesOllamaNativeStructuredOutputs(planner)) {
        responseText = await this.requestOllamaStructuredOutput(
          planner,
          messages,
          OLLAMA_PLAN_SCHEMA,
          320,
          'Planner',
          controller.signal,
        );
      } else {
        response = await fetch(buildChatCompletionsUrl(planner.baseUrl), {
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
          signal: controller.signal,
        });
        responseText = await response.text();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Planner timed out after ${PLANNER_REQUEST_TIMEOUT_MS}ms for ${employee.name} on ${planner.model}.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (response && !response.ok) {
      throw new Error(`Planner HTTP ${response.status} on ${planner.model}: ${responseText.slice(0, 220)}`);
    }

    let planPayload: ReturnType<typeof sanitizeLivePlanPayload>;
    if (usesOllamaNativeStructuredOutputs(planner)) {
      planPayload = sanitizeLivePlanPayload(extractJsonObject(responseText), employee);
    } else {
      let parsedResponse: PlannerChatResponse;
      try {
        parsedResponse = JSON.parse(responseText) as PlannerChatResponse;
      } catch {
        throw new Error('Planner returned invalid JSON.');
      }

      this.recordUsage(parsedResponse.usage, planner.model);
      const assistantText = extractAssistantText(parsedResponse.choices?.[0]?.message?.content);
      planPayload = sanitizeLivePlanPayload(extractJsonObject(assistantText), employee);
    }

    if (!planPayload) {
      throw new Error('Planner response did not match the expected schema.');
    }

    if (pendingRequest) {
      return this.buildLiveRequestResolutionPlan(employee, pendingRequest, planPayload);
    }

    if (this.isLowValueSetupLoop(employee, planPayload)) {
      throw new Error('Planner repeated a low-value setup loop instead of choosing a new initiative.');
    }

    return buildPlan(planPayload.title, planPayload.objective, planPayload.actions, 'live');
  }

  private recordUsage(rawUsage: unknown, model: string) {
    const usageDelta = readUsageTotals(rawUsage);
    const pricing = defaultPricingForModel(model);

    this.usage.inputTokens += usageDelta.inputTokens;
    this.usage.outputTokens += usageDelta.outputTokens;
    this.usage.totalTokens += usageDelta.totalTokens;
    this.usage.estimatedCostUsd = estimateCostUsd(this.usage.inputTokens, this.usage.outputTokens, {
      inputCostPer1M: 0,
      outputCostPer1M: 0,
    });

    const entry = this.usage.byModel.find((candidate) => candidate.model === model);
    if (entry) {
      entry.requestCount += 1;
      entry.inputTokens += usageDelta.inputTokens;
      entry.outputTokens += usageDelta.outputTokens;
      entry.totalTokens += usageDelta.totalTokens;
      entry.estimatedCostUsd = estimateCostUsd(entry.inputTokens, entry.outputTokens, pricing);
    } else {
      this.usage.byModel.push({
        model,
        requestCount: 1,
        inputTokens: usageDelta.inputTokens,
        outputTokens: usageDelta.outputTokens,
        totalTokens: usageDelta.totalTokens,
        estimatedCostUsd: estimateCostUsd(usageDelta.inputTokens, usageDelta.outputTokens, pricing),
      });
    }

    this.usage.requestCount = Math.max(
      this.usage.requestCount,
      this.usage.byModel.reduce((total, item) => total + item.requestCount, 0),
    );
    this.usage.estimatedCostUsd = Number(
      this.usage.byModel.reduce((total, item) => total + item.estimatedCostUsd, 0).toFixed(6),
    );
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

function labelForActionType(type: OfficeActionType) {
  switch (type) {
    case 'read_private_notes':
      return 'Reading desk notes';
    case 'read_archives':
      return 'Consulting archives';
    case 'review_email':
      return 'Reviewing email';
    case 'fetch_context':
      return 'Fetching context';
    case 'investigate':
      return 'Investigating';
    case 'desk_work':
      return 'Desk work';
    case 'draft_email':
      return 'Drafting email';
    case 'send_email':
      return 'Sending email';
    case 'ask_permission':
      return 'Requesting permission';
    case 'request_review':
      return 'Requesting review';
    case 'second_opinion':
      return 'Getting second opinion';
    case 'resolve_request':
      return 'Resolving request';
    case 'report_back':
      return 'Reporting back';
    case 'escalate_terminal':
      return 'Escalating';
    case 'archive_note':
      return 'Archiving';
    default:
      return 'Working';
  }
}
