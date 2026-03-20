import { randomUUID } from 'node:crypto';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import {
  MODEL_NAME,
  locationIds,
  locations,
  type AgentId,
  type AgentState,
  type EventType,
  type LocationId,
  type MemoryEntry,
  type MemoryType,
  type SimulationMode,
  type SimulationState,
  type WorldEvent,
} from '../shared/types.js';

const agentIds = ['sam', 'jeremy'] as const;
const maxTimelineEntries = 18;
const maxMemoriesPerAgent = 8;

const agentDecisionSchema = z.object({
  goal: z.string().min(1).max(120),
  mood: z.string().min(1).max(60),
  intention: z.string().min(1).max(180),
  action: z.enum(['move', 'talk', 'observe', 'reflect', 'rest']),
  targetLocationId: z.enum(locationIds).nullable(),
  targetAgentId: z.enum(agentIds).nullable(),
  say: z.string().max(180).nullable(),
  memory: z.string().min(1).max(220),
});

type AgentDecision = z.infer<typeof agentDecisionSchema>;

export class SmallvilleSimulation {
  private readonly client = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  private state = createInitialState(this.client ? 'live' : 'mock');

  getState(): SimulationState {
    return cloneState(this.state);
  }

  reset(): SimulationState {
    this.state = createInitialState(this.client ? 'live' : 'mock');
    return this.getState();
  }

  async step(): Promise<SimulationState> {
    this.state.tick += 1;

    for (const agentId of this.state.agents.map((agent) => agent.id)) {
      const actor = this.getAgent(agentId);
      const decision = await this.resolveDecision(actor);
      this.applyDecision(actor, decision);
    }

    this.state.lastUpdatedAt = new Date().toISOString();

    return this.getState();
  }

  private async resolveDecision(agent: AgentState): Promise<AgentDecision> {
    if (!this.client) {
      return this.mockDecision(agent);
    }

    try {
      const response = await this.client.responses.parse({
        model: MODEL_NAME,
        reasoning: { effort: 'low' },
        instructions: this.buildInstructions(agent),
        input: this.buildPrompt(agent),
        max_output_tokens: 280,
        text: {
          format: zodTextFormat(agentDecisionSchema, 'smallville_agent_turn'),
          verbosity: 'low',
        },
      });

      if (!response.output_parsed) {
        return this.mockDecision(agent);
      }

      return this.sanitizeDecision(agent, response.output_parsed);
    } catch (error) {
      console.error(`Falling back to mock behavior for ${agent.name}.`, error);
      return this.mockDecision(agent);
    }
  }

  private buildInstructions(agent: AgentState): string {
    return [
      `You are ${agent.name}, an autonomous resident in a tiny social simulation.`,
      `Your model label is ${MODEL_NAME}, but you are roleplaying a believable person.`,
      'Make one grounded decision for this tick.',
      'Behave like a character with memory, routine, and social awareness.',
      'If you choose talk, keep dialogue first-person, natural, and under 140 characters.',
      'If you choose move, select one of the listed location ids.',
      'If the other character is nearby, react to them rather than ignoring them every turn.',
      'Keep your memory line concrete enough to store as a future episodic memory.',
    ].join(' ');
  }

  private buildPrompt(agent: AgentState): string {
    const otherAgents = this.state.agents
      .filter((candidate) => candidate.id !== agent.id)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        locationId: candidate.locationId,
        goal: candidate.goal,
        mood: candidate.mood,
        lastAction: candidate.lastAction,
      }));

    const currentLocation = this.getLocation(agent.locationId);

    return JSON.stringify(
      {
        worldPremise: this.state.worldPremise,
        tick: this.state.tick,
        availableLocations: this.state.locations.map((location) => ({
          id: location.id,
          name: location.name,
          description: location.description,
          neighbors: location.neighbors,
        })),
        you: {
          id: agent.id,
          name: agent.name,
          archetype: agent.archetype,
          personality: agent.personality,
          locationId: agent.locationId,
          locationDescription: currentLocation.description,
          goal: agent.goal,
          mood: agent.mood,
          relationships: agent.relationships,
          recentMemories: agent.memories.slice(-5).map((memory) => ({
            tick: memory.tick,
            type: memory.type,
            text: memory.text,
          })),
        },
        others: otherAgents,
        recentWorldEvents: this.state.timeline.slice(-4).map((event) => ({
          tick: event.tick,
          actorName: event.actorName,
          summary: event.summary,
          locationId: event.locationId,
        })),
      },
      null,
      2,
    );
  }

  private sanitizeDecision(agent: AgentState, decision: AgentDecision): AgentDecision {
    const other = this.getOtherAgent(agent.id);

    const sanitized: AgentDecision = {
      goal: decision.goal.trim(),
      mood: decision.mood.trim(),
      intention: decision.intention.trim(),
      action: decision.action,
      targetLocationId: decision.targetLocationId,
      targetAgentId: decision.targetAgentId,
      say: decision.say?.trim() || null,
      memory: decision.memory.trim(),
    };

    if (sanitized.action === 'move' && !sanitized.targetLocationId) {
      sanitized.targetLocationId = this.pickNextLocation(agent.locationId, other.locationId);
    }

    if (sanitized.action === 'talk') {
      sanitized.targetAgentId = sanitized.targetAgentId && sanitized.targetAgentId !== agent.id
        ? sanitized.targetAgentId
        : other.id;

      if (!sanitized.say) {
        sanitized.say = `I think we should compare notes while we're both still nearby.`;
      }
    } else {
      sanitized.targetAgentId = null;
      sanitized.say = null;
    }

    if (sanitized.action !== 'move') {
      sanitized.targetLocationId = null;
    }

    return sanitized;
  }

  private applyDecision(agent: AgentState, decision: AgentDecision): void {
    const other = this.getOtherAgent(agent.id);

    agent.goal = decision.goal;
    agent.mood = decision.mood;
    agent.lastThought = decision.intention;

    switch (decision.action) {
      case 'move': {
        const targetLocationId = decision.targetLocationId ?? this.pickNextLocation(agent.locationId, other.locationId);
        const origin = this.getLocation(agent.locationId);
        const destination = this.getLocation(targetLocationId);
        agent.locationId = destination.id;
        agent.lastDialogue = null;
        agent.lastAction = `${agent.name} left ${origin.name} and headed to ${destination.name}.`;

        this.remember(agent, 'action', decision.memory, 0.72);
        this.pushEvent(
          this.createEvent(agent, 'move', destination.id, {
            summary: `${agent.name} heads to ${destination.name}.`,
            detail: `${decision.intention} ${destination.description}`,
          }),
        );

        return;
      }

      case 'talk': {
        if (agent.locationId !== other.locationId) {
          const destination = this.getLocation(other.locationId);
          agent.locationId = destination.id;
          agent.lastDialogue = null;
          agent.lastAction = `${agent.name} moved to ${destination.name} to find ${other.name}.`;

          this.remember(agent, 'action', `I went looking for ${other.name}.`, 0.7);
          this.pushEvent(
            this.createEvent(agent, 'move', destination.id, {
              summary: `${agent.name} goes looking for ${other.name}.`,
              detail: `${decision.intention} ${other.name} is at ${destination.name}.`,
            }),
          );

          return;
        }

        const dialogue = decision.say ?? `I wanted to check in before the mood changed.`;
        agent.lastDialogue = dialogue;
        agent.lastAction = `${agent.name} spoke with ${other.name}.`;

        this.remember(agent, 'conversation', decision.memory, 0.82);
        this.remember(other, 'conversation', `${agent.name} told me: "${dialogue}"`, 0.78);
        this.pushEvent(
          this.createEvent(agent, 'talk', agent.locationId, {
            summary: `${agent.name} talks with ${other.name}.`,
            detail: `${decision.intention} ${dialogue}`,
            dialogue,
          }),
        );

        return;
      }

      case 'observe': {
        const coPresent = this.presentAgentsAt(agent.locationId)
          .filter((candidate) => candidate.id !== agent.id)
          .map((candidate) => candidate.name);
        const observation = coPresent.length
          ? `${agent.name} studies ${coPresent.join(', ')} at ${this.getLocation(agent.locationId).name}.`
          : `${agent.name} quietly studies the atmosphere at ${this.getLocation(agent.locationId).name}.`;

        agent.lastDialogue = null;
        agent.lastAction = observation;
        this.remember(agent, 'observation', decision.memory, 0.64);
        this.pushEvent(
          this.createEvent(agent, 'observe', agent.locationId, {
            summary: observation,
            detail: decision.intention,
          }),
        );

        return;
      }

      case 'reflect': {
        agent.lastDialogue = null;
        agent.lastAction = `${agent.name} pauses to connect recent events.`;
        this.remember(agent, 'reflection', decision.memory, 0.76);
        this.pushEvent(
          this.createEvent(agent, 'reflect', agent.locationId, {
            summary: `${agent.name} reflects in place.`,
            detail: decision.intention,
          }),
        );

        return;
      }

      case 'rest': {
        agent.lastDialogue = null;
        agent.lastAction = `${agent.name} slows down and settles into the moment.`;
        this.remember(agent, 'action', decision.memory, 0.55);
        this.pushEvent(
          this.createEvent(agent, 'rest', agent.locationId, {
            summary: `${agent.name} takes a quiet beat.`,
            detail: decision.intention,
          }),
        );
      }
    }
  }

  private createEvent(
    agent: AgentState,
    type: EventType,
    locationId: LocationId,
    values: { summary: string; detail: string; dialogue?: string | null },
  ): WorldEvent {
    return {
      id: randomUUID(),
      tick: this.state.tick,
      actorId: agent.id,
      actorName: agent.name,
      type,
      summary: values.summary,
      detail: values.detail,
      locationId,
      dialogue: values.dialogue ?? null,
    };
  }

  private pushEvent(event: WorldEvent): void {
    this.state.timeline.push(event);
    this.state.timeline = this.state.timeline.slice(-maxTimelineEntries);
  }

  private remember(agent: AgentState, type: MemoryType, text: string, importance: number): void {
    const memory: MemoryEntry = {
      id: randomUUID(),
      tick: this.state.tick,
      type,
      text,
      importance,
    };

    agent.memories.push(memory);
    agent.memories = agent.memories
      .sort((left, right) => {
        if (left.tick !== right.tick) {
          return left.tick - right.tick;
        }

        return left.importance - right.importance;
      })
      .slice(-maxMemoriesPerAgent);
  }

  private mockDecision(agent: AgentState): AgentDecision {
    const other = this.getOtherAgent(agent.id);
    const sameLocation = agent.locationId === other.locationId;

    if (sameLocation && this.state.tick % 2 === 0) {
      return {
        goal: agent.id === 'sam' ? 'Figure out Jeremy’s latest idea.' : 'Hear what Sam has been noticing.',
        mood: agent.id === 'sam' ? 'curious' : 'open',
        intention: `A direct conversation with ${other.name} feels more useful than drifting.`,
        action: 'talk',
        targetLocationId: null,
        targetAgentId: other.id,
        say:
          agent.id === 'sam'
            ? 'You always hear the hidden rhythm first. What stands out today?'
            : 'You notice patterns before I do. What changed for you this morning?',
        memory:
          agent.id === 'sam'
            ? `I asked ${other.name} to share what he was sensing in town.`
            : `I invited ${other.name} to compare impressions about the town.`,
      };
    }

    if (!sameLocation && this.state.tick % 3 !== 0) {
      return {
        goal: `Catch up with ${other.name} in person.`,
        mood: 'intent',
        intention: `Being in the same place as ${other.name} will give me better context than guessing from afar.`,
        action: 'move',
        targetLocationId: other.locationId,
        targetAgentId: null,
        say: null,
        memory: `I decided to move toward ${other.name} instead of staying put.`,
      };
    }

    if (this.state.tick % 3 === 0) {
      return {
        goal: agent.id === 'sam' ? 'Capture a clean emotional read on the town.' : 'Collect a fresh ambient detail.',
        mood: agent.id === 'sam' ? 'attentive' : 'focused',
        intention:
          agent.id === 'sam'
            ? 'A moment of reflection will help me turn scattered impressions into a story.'
            : 'Observing the environment directly will give me more texture than talking again immediately.',
        action: agent.id === 'sam' ? 'reflect' : 'observe',
        targetLocationId: null,
        targetAgentId: null,
        say: null,
        memory:
          agent.id === 'sam'
            ? 'I paused long enough to shape the mood of the town into a clearer narrative.'
            : 'I watched the room closely to catch details I might otherwise miss.',
      };
    }

    return {
      goal: agent.id === 'sam' ? 'Stay near places where people leave traces.' : 'Keep circulating where ideas can turn into sound.',
      mood: agent.id === 'sam' ? 'steady' : 'restless',
      intention:
        agent.id === 'sam'
          ? 'Moving keeps me from getting trapped in the same interpretation.'
          : 'A new room usually gives me a better creative angle than forcing one.',
      action: 'move',
      targetLocationId: this.pickNextLocation(agent.locationId, other.locationId),
      targetAgentId: null,
      say: null,
      memory:
        agent.id === 'sam'
          ? 'I changed locations to see whether the town felt different from another angle.'
          : 'I moved again because fresh surroundings usually unlock better ideas.',
    };
  }

  private pickNextLocation(currentLocationId: LocationId, preferredLocationId: LocationId): LocationId {
    const current = this.getLocation(currentLocationId);

    if (current.neighbors.includes(preferredLocationId)) {
      return preferredLocationId;
    }

    return current.neighbors[0] ?? preferredLocationId;
  }

  private getAgent(agentId: AgentId): AgentState {
    const agent = this.state.agents.find((candidate) => candidate.id === agentId);

    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    return agent;
  }

  private getOtherAgent(agentId: AgentId): AgentState {
    const other = this.state.agents.find((candidate) => candidate.id !== agentId);

    if (!other) {
      throw new Error(`No counterpart found for agent ${agentId}`);
    }

    return other;
  }

  private getLocation(locationId: LocationId) {
    const location = this.state.locations.find((candidate) => candidate.id === locationId);

    if (!location) {
      throw new Error(`Unknown location: ${locationId}`);
    }

    return location;
  }

  private presentAgentsAt(locationId: LocationId): AgentState[] {
    return this.state.agents.filter((candidate) => candidate.locationId === locationId);
  }
}

function createInitialState(mode: SimulationMode): SimulationState {
  return {
    tick: 0,
    mode,
    worldPremise:
      'A compact social sandbox inspired by Smallville: two residents move through a tiny town, notice each other, form memories, and let small interactions reshape the next turn.',
    locations,
    agents: [
      {
        id: 'sam',
        name: 'Sam',
        model: MODEL_NAME,
        archetype: 'narrative scout',
        personality: 'Sam is observant, warm, and slightly restless. She notices shifts in mood before anyone says them out loud.',
        locationId: 'cafe',
        goal: 'Figure out what kind of day the town is becoming.',
        mood: 'curious',
        lastThought: 'The town usually reveals itself indirectly.',
        lastAction: 'Sam is settling in with a notebook at Signal Cafe.',
        lastDialogue: null,
        relationships: {
          jeremy: 'Jeremy is the person Sam trusts to hear patterns she cannot articulate yet.',
        },
        memories: [
          createMemory(0, 'observation', 'The cafe feels like a good place to catch the town before it fully wakes up.', 0.62),
          createMemory(0, 'reflection', 'Jeremy usually notices the sonic texture behind whatever I am trying to describe.', 0.77),
        ],
        color: '#f26ca7',
      },
      {
        id: 'jeremy',
        name: 'Jeremy',
        model: MODEL_NAME,
        archetype: 'sound-focused builder',
        personality: 'Jeremy is methodical, dryly funny, and drawn to texture, rhythm, and hidden systems.',
        locationId: 'studio',
        goal: 'Find a sound worth building the day around.',
        mood: 'focused',
        lastThought: 'Most places say more than people expect if you let them keep talking.',
        lastAction: 'Jeremy is tuning a synth inside Echo Studio.',
        lastDialogue: null,
        relationships: {
          sam: 'Sam has a way of translating vague feelings into something Jeremy can actually work with.',
        },
        memories: [
          createMemory(0, 'action', 'The studio is quiet enough that tiny changes feel obvious.', 0.61),
          createMemory(0, 'reflection', 'Sam tends to arrive with questions that make the room sound different afterward.', 0.79),
        ],
        color: '#3da9fc',
      },
    ],
    timeline: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function createMemory(
  tick: number,
  type: MemoryType,
  text: string,
  importance: number,
): MemoryEntry {
  return {
    id: randomUUID(),
    tick,
    type,
    text,
    importance,
  };
}

function cloneState(state: SimulationState): SimulationState {
  return JSON.parse(JSON.stringify(state)) as SimulationState;
}
