import { actions, locations, requestKinds } from "./model.ts";
import type {
  EmployeeId,
  OfficeActionType,
  OfficeLocationId,
  OfficeRequestKind,
} from "../api/simulationEngine.ts";

export type CanonicalEventType =
  | "run.started"
  | "movement.completed"
  | "waiting.started"
  | "action.completed"
  | "request.created"
  | "request.approved"
  | "request.rejected"
  | "request.escalated"
  | "email.sent"
  | "item.archived"
  | "planner.failed"
  | "run.finished";
export interface CanonicalEvent {
  schemaVersion: 1;
  runId: string;
  scenarioId: string;
  scenarioVersion: 1;
  sequence: number;
  tick: number;
  type: CanonicalEventType;
  actorId: EmployeeId | null;
  payload: Record<string, unknown>;
}
export const eventTypes = new Set<CanonicalEventType>([
  "run.started",
  "movement.completed",
  "waiting.started",
  "action.completed",
  "request.created",
  "request.approved",
  "request.rejected",
  "request.escalated",
  "email.sent",
  "item.archived",
  "planner.failed",
  "run.finished",
]);
export const safeIdentity = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
const safeText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
function fail(message: string): never {
  throw new Error(`Malformed event stream: ${message}`);
}
function exact(
  payload: Record<string, unknown>,
  keys: string[],
  type: string,
): void {
  if (Object.keys(payload).some((key) => !keys.includes(key))) {
    fail(`${type} has unknown payload field`);
  }
  const missing = keys.find((key) => !(key in payload));
  if (missing) fail(`${type} is missing payload field ${missing}`);
}
function text(
  payload: Record<string, unknown>,
  key: string,
  type: string,
): string {
  if (!safeText(payload[key])) fail(`${type}.${key} must be non-empty text`);
  return payload[key] as string;
}
function duration(payload: Record<string, unknown>, type: string): void {
  if (
    !Number.isSafeInteger(payload.durationTicks) ||
    (payload.durationTicks as number) < 1
  ) fail(`${type}.durationTicks must be positive`);
}

export function assertCanonicalEvents(events: CanonicalEvent[]): void {
  if (!Array.isArray(events) || events.length > 100000) {
    fail("events must be a bounded array");
  }
  let previousTick = -1;
  for (const [index, event] of events.entries()) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      fail(`event ${index} must be an object`);
    }
    const keys = Object.keys(event);
    const expected = [
      "schemaVersion",
      "runId",
      "scenarioId",
      "scenarioVersion",
      "sequence",
      "tick",
      "type",
      "actorId",
      "payload",
    ];
    if (
      keys.length !== expected.length ||
      expected.some((key) => !keys.includes(key))
    ) fail(`event ${index} has invalid envelope keys`);
    if (
      event.schemaVersion !== 1 || event.scenarioVersion !== 1 ||
      !safeIdentity(event.runId) || !safeIdentity(event.scenarioId)
    ) fail(`event ${index} has invalid identity`);
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== index + 1) {
      fail(`event ${index} has invalid sequence`);
    }
    if (
      !Number.isSafeInteger(event.tick) || event.tick < 0 ||
      event.tick < previousTick
    ) fail(`event ${index} has backward or invalid tick`);
    previousTick = event.tick;
    if (
      !eventTypes.has(event.type) ||
      (event.actorId !== null && !safeIdentity(event.actorId))
    ) fail(`event ${index} has invalid type or actor`);
    if (
      !event.payload || typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) fail(`event ${index} has invalid payload`);
    const payload = event.payload;
    switch (event.type) {
      case "run.started":
        exact(payload, ["seed"], event.type);
        if (!Number.isSafeInteger(payload.seed)) {
          fail("run.started.seed must be an integer");
        }
        if (event.actorId !== null) fail("run.started actor must be null");
        break;
      case "movement.completed":
        exact(
          payload,
          ["fromLocationId", "locationId", "durationTicks"],
          event.type,
        );
        if (
          !locations.has(text(payload, "fromLocationId", event.type)) ||
          !locations.has(text(payload, "locationId", event.type))
        ) fail("movement has invalid location");
        duration(payload, event.type);
        if (event.actorId === null) fail("movement requires actor");
        break;
      case "waiting.started":
        exact(payload, ["reason", "durationTicks"], event.type);
        text(payload, "reason", event.type);
        duration(payload, event.type);
        if (event.actorId === null) fail("waiting requires actor");
        break;
      case "action.completed":
        exact(payload, [
          "action",
          "stepId",
          "label",
          "locationId",
          "inboxId",
          "emailSubject",
          "requestKey",
        ], event.type);
        if (
          !actions.has(text(payload, "action", event.type)) ||
          !locations.has(text(payload, "locationId", event.type))
        ) fail("action has invalid action or location");
        text(payload, "stepId", event.type);
        text(payload, "label", event.type);
        for (const key of ["inboxId", "emailSubject", "requestKey"]) {
          if (payload[key] !== null && !safeText(payload[key])) {
            fail(`action.${key} must be text or null`);
          }
        }
        if (event.actorId === null) fail("action requires actor");
        break;
      case "request.created":
        exact(
          payload,
          ["requestId", "requestKey", "kind", "targetId", "title"],
          event.type,
        );
        text(payload, "requestId", event.type);
        text(payload, "requestKey", event.type);
        if (
          !requestKinds.has(text(payload, "kind", event.type)) ||
          !safeIdentity(payload.targetId)
        ) fail("request has invalid kind or target");
        text(payload, "title", event.type);
        if (event.actorId === null) fail("request requires actor");
        break;
      case "request.approved":
      case "request.rejected":
      case "request.escalated":
        exact(payload, ["requestId", "decision"], event.type);
        text(payload, "requestId", event.type);
        text(payload, "decision", event.type);
        if (event.actorId === null) fail("request decision requires actor");
        break;
      case "email.sent":
        exact(
          payload,
          ["emailId", "subject", "inboxId", "requestKey"],
          event.type,
        );
        text(payload, "emailId", event.type);
        text(payload, "subject", event.type);
        text(payload, "inboxId", event.type);
        text(payload, "requestKey", event.type);
        if (event.actorId === null) fail("email requires actor");
        break;
      case "item.archived":
        exact(payload, ["reference", "inboxId", "archiveId"], event.type);
        text(payload, "reference", event.type);
        text(payload, "inboxId", event.type);
        text(payload, "archiveId", event.type);
        if (event.actorId === null) fail("archive requires actor");
        break;
      case "planner.failed":
        exact(payload, ["reason"], event.type);
        text(payload, "reason", event.type);
        break;
      case "run.finished":
        exact(payload, ["completed"], event.type);
        if (typeof payload.completed !== "boolean" || event.actorId !== null) {
          fail("run.finished is invalid");
        }
        break;
    }
  }
}
