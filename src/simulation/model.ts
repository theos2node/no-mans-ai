import type {
  EmployeeId,
  OfficeActionType,
  OfficeLocationId,
  OfficeRequestKind,
} from "../api/simulationEngine.ts";

export const SCENARIO_VERSION = 1;
export const MAX_SCENARIO_BYTES = 256 * 1024;
export const MAX_SCENARIO_ITEMS = 1000;

export interface ScenarioEmployee {
  id: EmployeeId;
  locationId: OfficeLocationId;
}
export interface ScenarioStep {
  id: string;
  actorId: EmployeeId;
  action: OfficeActionType;
  locationId: OfficeLocationId;
  label: string;
  requestKind?: OfficeRequestKind;
  targetId?: EmployeeId;
  requestKey?: string;
  inboxId?: string;
  emailSubject?: string;
}
export type ScenarioGoal =
  | {
    id: string;
    type: "action";
    action: OfficeActionType;
    actorId?: EmployeeId;
    count?: number;
  }
  | {
    id: string;
    type: "request";
    status: "approved" | "rejected" | "escalated";
    count?: number;
  }
  | { id: string; type: "email"; subject: string; count?: number }
  | { id: string; type: "archived"; reference: string; count?: number };
export interface ScenarioDefinition {
  version: 1;
  id: string;
  name: string;
  seed: number;
  employees: ScenarioEmployee[];
  inbox: Array<{ id: string; subject: string; reference: string }>;
  steps: ScenarioStep[];
  goals: ScenarioGoal[];
}

export const actions = new Set<string>([
  "read_private_notes",
  "read_archives",
  "review_email",
  "fetch_context",
  "investigate",
  "desk_work",
  "draft_email",
  "send_email",
  "ask_permission",
  "request_review",
  "second_opinion",
  "resolve_request",
  "report_back",
  "escalate_terminal",
  "archive_note",
]);
export const locations = new Set<string>([
  "break-room",
  "react-a",
  "react-b",
  "react-c",
  "react-d",
  "customer-relations",
  "war-room",
  "coordinator",
  "it-support",
  "red-terminal",
  "archives",
  "quality-assurance",
  "general-manager",
]);
export const requestKinds = new Set<string>([
  "approval",
  "review",
  "second_opinion",
  "investigation",
]);

function fail(message: string): never {
  throw new Error(`Invalid scenario: ${message}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}
function exact(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path} has unknown field ${key}`);
  }
}
function stringField(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 256) {
    fail(`${path} must be a safe non-empty string`);
  }
  return value;
}
function identityField(value: unknown, path: string): string {
  const result = stringField(value, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(result)) {
    fail(`${path} must be a safe identity`);
  }
  return result;
}
function unique(set: Set<string>, value: string, path: string): void {
  if (set.has(value)) fail(`duplicate ${path} ${value}`);
  set.add(value);
}

export function validateScenario(input: unknown): ScenarioDefinition {
  if (typeof input === "string" && input.length > MAX_SCENARIO_BYTES) {
    fail("scenario exceeds size limit");
  }
  const value = object(input, "root");
  exact(value, [
    "version",
    "id",
    "name",
    "seed",
    "employees",
    "inbox",
    "steps",
    "goals",
  ], "root");
  if (value.version !== SCENARIO_VERSION) {
    fail(`version must be ${SCENARIO_VERSION}`);
  }
  const id = identityField(value.id, "id");
  const name = stringField(value.name, "name");
  if (!Number.isInteger(value.seed)) fail("seed must be an integer");
  if (
    !Array.isArray(value.employees) || value.employees.length === 0 ||
    value.employees.length > MAX_SCENARIO_ITEMS
  ) fail("employees has an invalid size");
  const employeeIds = new Set<string>();
  const employees = value.employees.map((item, index) => {
    const entry = object(item, `employees[${index}]`);
    exact(entry, ["id", "locationId"], `employees[${index}]`);
    const employeeId = identityField(entry.id, `employees[${index}].id`);
    unique(employeeIds, employeeId, "employee id");
    const locationId = stringField(
      entry.locationId,
      `employees[${index}].locationId`,
    );
    if (!locations.has(locationId)) fail(`unknown location ${locationId}`);
    return {
      id: employeeId as EmployeeId,
      locationId: locationId as OfficeLocationId,
    };
  });
  if (!Array.isArray(value.inbox) || value.inbox.length > MAX_SCENARIO_ITEMS) {
    fail("inbox has an invalid size");
  }
  const inboxIds = new Set<string>();
  const references = new Set<string>();
  const inbox = value.inbox.map((item, index) => {
    const entry = object(item, `inbox[${index}]`);
    exact(entry, ["id", "subject", "reference"], `inbox[${index}]`);
    const inboxId = identityField(entry.id, `inbox[${index}].id`);
    unique(inboxIds, inboxId, "inbox id");
    const reference = identityField(
      entry.reference,
      `inbox[${index}].reference`,
    );
    unique(references, reference, "inbox reference");
    return {
      id: inboxId,
      subject: stringField(entry.subject, `inbox[${index}].subject`),
      reference,
    };
  });
  if (
    !Array.isArray(value.steps) || value.steps.length === 0 ||
    value.steps.length > MAX_SCENARIO_ITEMS
  ) fail("steps has an invalid size");
  const stepIds = new Set<string>();
  const requestKeys = new Set<string>();
  const steps = value.steps.map((item, index) => {
    const entry = object(item, `steps[${index}]`);
    exact(entry, [
      "id",
      "actorId",
      "action",
      "locationId",
      "label",
      "requestKind",
      "targetId",
      "requestKey",
      "inboxId",
      "emailSubject",
    ], `steps[${index}]`);
    const stepId = identityField(entry.id, `steps[${index}].id`);
    unique(stepIds, stepId, "step id");
    const actorId = identityField(entry.actorId, `steps[${index}].actorId`);
    if (!employeeIds.has(actorId)) fail(`unknown actor ${actorId}`);
    const action = stringField(entry.action, `steps[${index}].action`);
    if (!actions.has(action)) fail(`unknown action ${action}`);
    const locationId = stringField(
      entry.locationId,
      `steps[${index}].locationId`,
    );
    if (!locations.has(locationId)) fail(`unknown location ${locationId}`);
    const result: ScenarioStep = {
      id: stepId,
      actorId: actorId as EmployeeId,
      action: action as OfficeActionType,
      locationId: locationId as OfficeLocationId,
      label: stringField(entry.label, `steps[${index}].label`),
    };
    if (entry.requestKind !== undefined) {
      const kind = stringField(
        entry.requestKind,
        `steps[${index}].requestKind`,
      );
      if (!requestKinds.has(kind)) fail(`unknown request kind ${kind}`);
      result.requestKind = kind as OfficeRequestKind;
    }
    if (entry.targetId !== undefined) {
      const targetId = identityField(
        entry.targetId,
        `steps[${index}].targetId`,
      );
      if (!employeeIds.has(targetId)) fail(`unknown target ${targetId}`);
      result.targetId = targetId as EmployeeId;
    }
    if (entry.requestKey !== undefined) {
      result.requestKey = identityField(
        entry.requestKey,
        `steps[${index}].requestKey`,
      );
      if (["ask_permission", "request_review"].includes(action)) {
        unique(requestKeys, result.requestKey, "request key");
      }
    }
    if (entry.inboxId !== undefined) {
      result.inboxId = identityField(entry.inboxId, `steps[${index}].inboxId`);
      if (!inboxIds.has(result.inboxId)) {
        fail(`unknown inbox item ${result.inboxId}`);
      }
    }
    if (entry.emailSubject !== undefined) {
      result.emailSubject = stringField(
        entry.emailSubject,
        `steps[${index}].emailSubject`,
      );
    }
    if (
      ["review_email", "archive_note", "draft_email", "send_email"].includes(
        action,
      ) && !result.inboxId
    ) fail(`${action} requires inboxId`);
    if (
      ["ask_permission", "request_review"].includes(action) &&
      (!result.requestKey || !result.targetId || !result.requestKind)
    ) fail(`${action} requires requestKey, requestKind, and targetId`);
    if (action === "resolve_request" && !result.requestKey) {
      fail("resolve_request requires requestKey");
    }
    if (
      ["draft_email", "send_email"].includes(action) && !result.emailSubject
    ) fail(`${action} requires emailSubject`);
    if (action === "send_email" && !result.requestKey) {
      fail("send_email requires requestKey");
    }
    return result;
  });
  const goals: ScenarioGoal[] = [];
  const goalIds = new Set<string>();
  if (!Array.isArray(value.goals) || value.goals.length > MAX_SCENARIO_ITEMS) {
    fail("goals has an invalid size");
  }
  for (const [index, item] of value.goals.entries()) {
    const entry = object(item, `goals[${index}]`);
    const type = stringField(entry.type, `goals[${index}].type`);
    const goalId = identityField(entry.id, `goals[${index}].id`);
    unique(goalIds, goalId, "goal id");
    const count = entry.count === undefined ? 1 : entry.count;
    if (
      !Number.isInteger(count) || (count as number) < 1 ||
      (count as number) > MAX_SCENARIO_ITEMS
    ) fail(`goals[${index}].count is invalid`);
    if (type === "action") {
      exact(
        entry,
        ["id", "type", "action", "actorId", "count"],
        `goals[${index}]`,
      );
      const action = stringField(entry.action, `goals[${index}].action`);
      if (!actions.has(action)) fail(`unknown goal action ${action}`);
      if (
        entry.actorId !== undefined &&
        (!employeeIds.has(entry.actorId as string))
      ) fail(`unknown goal actor ${entry.actorId}`);
      goals.push({
        id: goalId,
        type: "action",
        action: action as OfficeActionType,
        actorId: entry.actorId as EmployeeId | undefined,
        count: count as number,
      });
    } else if (type === "request") {
      exact(entry, ["id", "type", "status", "count"], `goals[${index}]`);
      const status = stringField(entry.status, `goals[${index}].status`);
      if (!["approved", "rejected", "escalated"].includes(status)) {
        fail(`unknown request status ${status}`);
      }
      goals.push({
        id: goalId,
        type: "request",
        status: status as "approved" | "rejected" | "escalated",
        count: count as number,
      });
    } else if (type === "email") {
      exact(entry, ["id", "type", "subject", "count"], `goals[${index}]`);
      goals.push({
        id: goalId,
        type: "email",
        subject: stringField(entry.subject, `goals[${index}].subject`),
        count: count as number,
      });
    } else if (type === "archived") {
      exact(entry, ["id", "type", "reference", "count"], `goals[${index}]`);
      const reference = identityField(
        entry.reference,
        `goals[${index}].reference`,
      );
      if (!references.has(reference)) {
        fail(`unknown goal reference ${reference}`);
      }
      goals.push({
        id: goalId,
        type: "archived",
        reference,
        count: count as number,
      });
    } else fail(`unknown goal type ${type}`);
  }
  validateScenarioCausality({
    version: 1,
    id,
    name,
    seed: value.seed as number,
    employees,
    inbox,
    steps,
    goals,
  });
  return {
    version: 1,
    id,
    name,
    seed: value.seed as number,
    employees,
    inbox,
    steps,
    goals,
  };
}

export function validateScenarioCausality(scenario: ScenarioDefinition): void {
  const requests = new Map<string, ScenarioStep>();
  const resolved = new Set<string>();
  const draftKeys = new Set<string>();
  const sentInboxIds = new Set<string>();
  const archivedInboxIds = new Set<string>();
  for (const step of scenario.steps) {
    if (step.action === "ask_permission" || step.action === "request_review") {
      requests.set(step.requestKey!, step);
    }
    if (step.action === "resolve_request") {
      const request = requests.get(step.requestKey!);
      if (!request) {
        fail(
          `resolve_request references unknown or later request ${step.requestKey}`,
        );
      }
      if (resolved.has(step.requestKey!)) {
        fail(`request ${step.requestKey} is resolved more than once`);
      }
      if (request.targetId !== step.actorId) {
        fail(
          `resolve_request actor must be request target for ${step.requestKey}`,
        );
      }
      resolved.add(step.requestKey!);
    }
    if (step.action === "draft_email") {
      draftKeys.add(`${step.inboxId}:${step.emailSubject}`);
    }
    if (step.action === "send_email") {
      if (sentInboxIds.has(step.inboxId!)) {
        fail(`send_email repeats inbox side effect ${step.inboxId}`);
      }
      if (!draftKeys.has(`${step.inboxId}:${step.emailSubject}`)) {
        fail(`send_email has no matching draft for ${step.inboxId}`);
      }
      const request = requests.get(step.requestKey!);
      if (!request) {
        fail(`send_email references unknown request ${step.requestKey}`);
      }
      const approved = scenario.steps.slice(0, scenario.steps.indexOf(step))
        .some((prior) =>
          prior.action === "resolve_request" &&
          prior.requestKey === step.requestKey
        );
      if (!approved) {
        fail(`send_email requires approved request ${step.requestKey}`);
      }
      sentInboxIds.add(step.inboxId!);
    }
    if (step.action === "archive_note") {
      if (archivedInboxIds.has(step.inboxId!)) {
        fail(`archive_note repeats inbox side effect ${step.inboxId}`);
      }
      archivedInboxIds.add(step.inboxId!);
    }
  }
}
