import { type ScenarioDefinition, validateScenario } from "./model.ts";
import { assertCanonicalEvents, type CanonicalEvent } from "./events.ts";
import { projectPublicState, type PublicRunState } from "./runner.ts";

function reject(message: string): never {
  throw new Error(`Invalid replay: ${message}`);
}
export function validateReplay(
  scenarioInput: ScenarioDefinition | unknown,
  events: CanonicalEvent[],
): ScenarioDefinition {
  const scenario = validateScenario(scenarioInput);
  assertCanonicalEvents(events);
  if (events.length === 0 || events[0].type !== "run.started") {
    reject("stream must begin with run.started");
  }
  const first = events[0];
  if (
    first.scenarioId !== scenario.id ||
    first.scenarioVersion !== scenario.version ||
    first.payload.seed !== scenario.seed
  ) reject("run/scenario identity or seed mismatch");
  for (const event of events) {
    if (
      event.runId !== first.runId || event.scenarioId !== scenario.id ||
      event.scenarioVersion !== scenario.version
    ) reject("event identity mismatch");
  }
  if (events.filter((event) => event.type === "run.started").length !== 1) {
    reject("stream must contain exactly one run.started");
  }
  const finishIndexes = events.map((event, index) =>
    event.type === "run.finished" ? index : -1
  ).filter((index) => index >= 0);
  if (finishIndexes.length > 1) {
    reject("stream must contain at most one run.finished");
  }
  if (finishIndexes.length === 1 && finishIndexes[0] !== events.length - 1) {
    reject("events after run.finished are forbidden");
  }
  const employeeIds = new Set(
    scenario.employees.map((employee) => employee.id),
  );
  const inbox = new Map(scenario.inbox.map((item) => [item.id, item]));
  const requests = new Map<
    string,
    { id: string; targetId: string; status: string; stepId: string }
  >();
  const requestIds = new Set<string>();
  const emailIds = new Set<string>();
  const archiveIds = new Set<string>();
  const emittedSideEffects = new Set<string>();
  const sentInboxIds = new Set<string>();
  const archivedInboxIds = new Set<string>();
  const steps = new Map(scenario.steps.map((step) => [step.id, step]));
  const executed = new Set<string>();
  const drafts = new Set<string>();
  let finished = false;
  for (const event of events) {
    if (finished) reject("events after finish");
    if (event.actorId && !employeeIds.has(event.actorId)) {
      reject(`unknown actor ${event.actorId}`);
    }
    if (event.type === "run.finished") {
      finished = true;
      continue;
    }
    if (
      event.type === "movement.completed" && event.actorId &&
      !employeeIds.has(event.actorId)
    ) reject("movement actor is invalid");
    if (event.type === "action.completed") {
      const step = steps.get(String(event.payload.stepId));
      if (!step || executed.has(step.id)) {
        reject("unknown or duplicate step action");
      }
      executed.add(step.id);
      if (
        step.actorId !== event.actorId ||
        step.action !== event.payload.action ||
        step.locationId !== event.payload.locationId
      ) reject("action does not match scenario step");
      if (
        (step.inboxId ?? null) !== event.payload.inboxId ||
        (step.emailSubject ?? null) !== event.payload.emailSubject ||
        (step.requestKey ?? null) !== event.payload.requestKey
      ) reject("action references do not match step");
      if (step.action === "draft_email") {
        drafts.add(`${step.inboxId}:${step.emailSubject}`);
      }
    }
    if (event.type === "request.created") {
      const key = String(event.payload.requestKey);
      const requestId = String(event.payload.requestId);
      const step = scenario.steps.find((candidate) =>
        candidate.requestKey === key &&
        (candidate.action === "ask_permission" ||
          candidate.action === "request_review")
      );
      if (
        requests.has(key) || requestIds.has(requestId) || !step ||
        !executed.has(step.id) ||
        step.actorId !== event.actorId ||
        step.targetId !== event.payload.targetId ||
        step.requestKind !== event.payload.kind
      ) reject("invalid request creation");
      requests.set(key, {
        id: requestId,
        targetId: String(event.payload.targetId),
        status: "pending",
        stepId: step.id,
      });
      requestIds.add(requestId);
    }
    if (
      ["request.approved", "request.rejected", "request.escalated"].includes(
        event.type,
      )
    ) {
      const request = [...requests.values()].find((item) =>
        item.id === event.payload.requestId
      );
      const step = request &&
        scenario.steps.find((candidate) =>
          candidate.action === "resolve_request" &&
          candidate.requestKey ===
            [...requests.entries()].find(([, value]) => value === request)?.[0]
        );
      if (
        !request || request.status !== "pending" ||
        request.targetId !== event.actorId || !step || !executed.has(step.id)
      ) reject("invalid request decision");
      request.status = event.type.split(".")[1];
    }
    if (event.type === "email.sent") {
      const emailId = String(event.payload.emailId);
      const item = inbox.get(String(event.payload.inboxId));
      const request = requests.get(String(event.payload.requestKey));
      const step = steps.get(String(event.payload.stepId));
      if (
        emailIds.has(emailId) || !item || !step ||
        step.action !== "send_email" || emittedSideEffects.has(step.id) ||
        sentInboxIds.has(String(event.payload.inboxId)) ||
        !executed.has(step.id) ||
        step.inboxId !== event.payload.inboxId ||
        step.emailSubject !== event.payload.subject ||
        step.requestKey !== event.payload.requestKey ||
        !drafts.has(`${item.id}:${event.payload.subject}`) || !request ||
        request.status !== "approved" || step.actorId !== event.actorId
      ) reject("email lacks matching inbox, draft, and approved request");
      emailIds.add(emailId);
      emittedSideEffects.add(step.id);
      sentInboxIds.add(String(event.payload.inboxId));
    }
    if (event.type === "item.archived") {
      const archiveId = String(event.payload.archiveId);
      const item = inbox.get(String(event.payload.inboxId));
      const step = steps.get(String(event.payload.stepId));
      if (
        archiveIds.has(archiveId) || !item || !step ||
        step.action !== "archive_note" || emittedSideEffects.has(step.id) ||
        archivedInboxIds.has(String(event.payload.inboxId)) ||
        !executed.has(step.id) ||
        step.inboxId !== event.payload.inboxId ||
        step.actorId !== event.actorId ||
        item.reference !== event.payload.reference
      ) reject("archive does not identify matching inbox item");
      archiveIds.add(archiveId);
      emittedSideEffects.add(step.id);
      archivedInboxIds.add(String(event.payload.inboxId));
    }
  }
  if (finished && executed.size < scenario.steps.length) {
    const final = events[events.length - 1];
    if (final.payload.completed === true) {
      reject("early finish cannot be completed");
    }
  }
  return scenario;
}
export function replayScenario(
  scenarioInput: ScenarioDefinition | unknown,
  events: CanonicalEvent[],
): PublicRunState {
  const scenario = validateReplay(scenarioInput, events);
  return projectPublicState(scenario, events);
}
