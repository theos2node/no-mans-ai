import type {
  EmployeeId,
  OfficeActionType,
  OfficeLocationId,
} from "../api/simulationEngine.ts";
import {
  type ScenarioDefinition,
  type ScenarioGoal,
  type ScenarioStep,
  validateScenario,
} from "./model.ts";
import { DeterministicIds, LogicalClock, SeededRandom } from "./runtime.ts";
import { assertCanonicalEvents, type CanonicalEvent } from "./events.ts";

export interface PublicRunState {
  status: "created" | "running" | "completed" | "finished";
  tick: number;
  employees: Record<
    string,
    {
      locationId: OfficeLocationId;
      phase: "idle" | "moving" | "working" | "waiting";
      lastAction: OfficeActionType | null;
    }
  >;
  inbox: Array<
    { id: string; subject: string; reference: string; archived: boolean }
  >;
  requests: Array<
    {
      id: string;
      kind: string;
      status: "pending" | "approved" | "rejected" | "escalated";
      fromId: string;
      toId: string;
      requestKey: string;
    }
  >;
  sentEmails: Array<{ id: string; subject: string; actorId: string }>;
}
export interface RunMetrics {
  completed: boolean;
  actions: number;
  movementTicks: number;
  waitingTicks: number;
  requests: number;
  approvals: number;
  rejections: number;
  escalations: number;
  plannerFailures: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  goals: Array<
    { id: string; satisfied: boolean; observed: number; required: number }
  >;
}
export interface RunResult {
  runId: string;
  scenarioId: string;
  seed: number;
  status: PublicRunState["status"];
  events: CanonicalEvent[];
  state: PublicRunState;
  metrics: RunMetrics;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function initialState(scenario: ScenarioDefinition): PublicRunState {
  return {
    status: "created",
    tick: 0,
    employees: Object.fromEntries(
      scenario.employees.map((
        employee,
      ) => [employee.id, {
        locationId: employee.locationId,
        phase: "idle",
        lastAction: null,
      }]),
    ),
    inbox: scenario.inbox.map((item) => ({ ...item, archived: false })),
    requests: [],
    sentEmails: [],
  };
}
function count(
  events: CanonicalEvent[],
  predicate: (event: CanonicalEvent) => boolean,
): number {
  return events.filter(predicate).length;
}
function goalObserved(goal: ScenarioGoal, events: CanonicalEvent[]): number {
  if (goal.type === "action") {
    return count(
      events,
      (e) =>
        e.type === "action.completed" && e.payload.action === goal.action &&
        (!goal.actorId || e.actorId === goal.actorId),
    );
  }
  if (goal.type === "request") {
    return count(events, (e) => e.type === `request.${goal.status}`);
  }
  if (goal.type === "email") {
    return count(
      events,
      (e) => e.type === "email.sent" && e.payload.subject === goal.subject,
    );
  }
  return count(
    events,
    (e) => e.type === "item.archived" && e.payload.reference === goal.reference,
  );
}
export function deriveMetrics(
  scenario: ScenarioDefinition,
  events: CanonicalEvent[],
): RunMetrics {
  const goals = scenario.goals.map((goal) => {
    const observed = goalObserved(goal, events);
    const required = goal.count ?? 1;
    return { id: goal.id, satisfied: observed >= required, observed, required };
  });
  const completed = goals.every((goal) => goal.satisfied) &&
    events.some((event) =>
      event.type === "run.finished" && event.payload.completed === true
    );
  return {
    completed,
    actions: count(events, (e) => e.type === "action.completed"),
    movementTicks: events.filter((e) => e.type === "movement.completed").reduce(
      (sum, e) => sum + Number(e.payload.durationTicks),
      0,
    ),
    waitingTicks: events.filter((e) => e.type === "waiting.started").reduce(
      (sum, e) => sum + Number(e.payload.durationTicks),
      0,
    ),
    requests: count(events, (e) => e.type === "request.created"),
    approvals: count(events, (e) => e.type === "request.approved"),
    rejections: count(events, (e) => e.type === "request.rejected"),
    escalations: count(events, (e) => e.type === "request.escalated"),
    plannerFailures: count(events, (e) => e.type === "planner.failed"),
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    goals,
  };
}
export function projectPublicState(
  scenarioInput: ScenarioDefinition | unknown,
  events: CanonicalEvent[],
): PublicRunState {
  const scenario = validateScenario(scenarioInput);
  assertCanonicalEvents(events);
  const state = initialState(scenario);
  let finished = false;
  for (const event of events) {
    state.tick = event.tick;
    if (event.actorId && state.employees[event.actorId]) {
      state.employees[event.actorId].phase = event.type === "waiting.started"
        ? "waiting"
        : event.type === "action.completed"
        ? "working"
        : state.employees[event.actorId].phase;
    }
    if (event.type === "run.started") state.status = "running";
    if (event.type === "movement.completed" && event.actorId) {
      state.employees[event.actorId].locationId = event.payload
        .locationId as OfficeLocationId;
    }
    if (event.type === "action.completed" && event.actorId) {
      state.employees[event.actorId].lastAction = event.payload
        .action as OfficeActionType;
    }
    if (event.type === "request.created") {
      state.requests.push({
        id: String(event.payload.requestId),
        kind: String(event.payload.kind),
        status: "pending",
        fromId: String(event.actorId),
        toId: String(event.payload.targetId),
        requestKey: String(event.payload.requestKey),
      });
    }
    if (
      event.type === "request.approved" || event.type === "request.rejected" ||
      event.type === "request.escalated"
    ) {
      const request = state.requests.find((item) =>
        item.id === event.payload.requestId
      );
      if (request) {
        request.status = event.type.split(".")[1] as
          | "approved"
          | "rejected"
          | "escalated";
      }
    }
    if (event.type === "email.sent") {
      state.sentEmails.push({
        id: String(event.payload.emailId),
        subject: String(event.payload.subject),
        actorId: String(event.actorId),
      });
    }
    if (event.type === "item.archived") {
      const item = state.inbox.find((entry) =>
        entry.id === event.payload.inboxId
      );
      if (item) item.archived = true;
    }
    if (event.type === "run.finished") {
      finished = true;
      state.status = event.payload.completed ? "completed" : "finished";
      for (const employee of Object.values(state.employees)) {
        employee.phase = "idle";
      }
    }
  }
  if (!finished && state.status === "created") return state;
  return state;
}

export class DeterministicSimulationRunner {
  readonly scenario: ScenarioDefinition;
  readonly runId: string;
  private readonly clock = new LogicalClock();
  private readonly random: SeededRandom;
  private readonly ids: DeterministicIds;
  private events: CanonicalEvent[] = [];
  private nextStep = 0;
  private state: PublicRunState;
  constructor(scenarioInput: unknown, runId = "run-001") {
    this.scenario = validateScenario(scenarioInput);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(runId)) {
      throw new Error("Invalid run ID");
    }
    this.runId = runId;
    this.random = new SeededRandom(this.scenario.seed);
    this.ids = new DeterministicIds(runId);
    this.state = initialState(this.scenario);
  }
  private emit(
    type: CanonicalEvent["type"],
    actorId: EmployeeId | null,
    payload: Record<string, unknown>,
    ticks = 0,
  ): void {
    this.clock.advance(ticks);
    this.events.push({
      schemaVersion: 1,
      runId: this.runId,
      scenarioId: this.scenario.id,
      scenarioVersion: this.scenario.version,
      sequence: this.events.length + 1,
      tick: this.clock.tick,
      type,
      actorId,
      payload,
    });
  }
  start(): RunResult {
    if (this.state.status === "created") {
      this.emit("run.started", null, { seed: this.scenario.seed });
      this.state = projectPublicState(this.scenario, this.events);
    }
    return this.result();
  }
  step(): RunResult {
    this.start();
    if (
      this.nextStep >= this.scenario.steps.length ||
      this.state.status === "finished" || this.state.status === "completed"
    ) return this.result();
    const step = this.scenario.steps[this.nextStep++];
    this.execute(step);
    this.state = projectPublicState(this.scenario, this.events);
    return this.result();
  }
  runToCompletion(): RunResult {
    this.start();
    while (this.nextStep < this.scenario.steps.length) this.step();
    return this.finish();
  }
  finish(): RunResult {
    this.start();
    if (this.state.status === "running") {
      const metrics = deriveMetrics(this.scenario, this.events);
      this.emit("run.finished", null, {
        completed: this.nextStep >= this.scenario.steps.length &&
          metrics.goals.every((goal) => goal.satisfied),
      });
      this.state = projectPublicState(this.scenario, this.events);
    }
    return this.result();
  }
  getEvents(): CanonicalEvent[] {
    return clone(this.events);
  }
  getState(): PublicRunState {
    return clone(projectPublicState(this.scenario, this.events));
  }
  result(): RunResult {
    const events = this.getEvents();
    return {
      runId: this.runId,
      scenarioId: this.scenario.id,
      seed: this.scenario.seed,
      status: this.getState().status,
      events,
      state: this.getState(),
      metrics: deriveMetrics(this.scenario, events),
    };
  }
  private execute(step: ScenarioStep): void {
    const employee = this.state.employees[step.actorId];
    const distance = employee.locationId !== step.locationId
      ? 1 + this.random.integer(3)
      : 0;
    if (distance) {
      this.emit("movement.completed", step.actorId, {
        fromLocationId: employee.locationId,
        locationId: step.locationId,
        durationTicks: distance,
      }, distance);
    }
    if (step.action === "ask_permission" || step.action === "request_review") {
      this.emit("waiting.started", step.actorId, {
        reason: "approval-request",
        durationTicks: 1,
      }, 1);
    }
    this.emit("action.completed", step.actorId, {
      action: step.action,
      stepId: step.id,
      label: step.label,
      locationId: step.locationId,
      inboxId: step.inboxId ?? null,
      emailSubject: step.emailSubject ?? null,
      requestKey: step.requestKey ?? null,
    });
    if (step.action === "ask_permission" || step.action === "request_review") {
      this.emit("request.created", step.actorId, {
        requestId: this.ids.next("request"),
        requestKey: step.requestKey!,
        kind: step.requestKind!,
        targetId: step.targetId!,
        title: step.label,
      });
    }
    if (step.action === "resolve_request") {
      const request = [...this.events].reverse().find((event) =>
        event.type === "request.created" &&
        event.payload.requestKey === step.requestKey
      );
      if (!request) throw new Error(`No pending request ${step.requestKey}`);
      this.emit("request.approved", step.actorId, {
        requestId: request.payload.requestId,
        decision: "approved",
      });
    }
    if (
      step.action === "draft_email"
    ) { /* The action event is the deterministic draft record. */ }
    if (step.action === "send_email") {
      this.emit("email.sent", step.actorId, {
        emailId: this.ids.next("email"),
        subject: step.emailSubject!,
        inboxId: step.inboxId!,
        requestKey: step.requestKey!,
      });
    }
    if (step.action === "archive_note") {
      const item = this.scenario.inbox.find((entry) =>
        entry.id === step.inboxId
      );
      if (!item) throw new Error(`No inbox item ${step.inboxId}`);
      this.emit("item.archived", step.actorId, {
        reference: item.reference,
        inboxId: item.id,
        archiveId: this.ids.next("archive"),
      });
    }
  }
}
