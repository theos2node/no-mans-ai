export const MODEL_NAME = 'gpt-5-nano' as const;

export const locationIds = ['town-square', 'cafe', 'garden', 'studio'] as const;

export type LocationId = (typeof locationIds)[number];
export type AgentId = 'sam' | 'jeremy';
export type EventType = 'move' | 'talk' | 'observe' | 'reflect' | 'rest';
export type MemoryType = 'action' | 'conversation' | 'observation' | 'reflection';
export type SimulationMode = 'live' | 'mock';

export interface LocationDefinition {
  id: LocationId;
  name: string;
  description: string;
  neighbors: LocationId[];
  accent: string;
}

export interface MemoryEntry {
  id: string;
  tick: number;
  type: MemoryType;
  text: string;
  importance: number;
}

export interface AgentState {
  id: AgentId;
  name: string;
  model: typeof MODEL_NAME;
  archetype: string;
  personality: string;
  locationId: LocationId;
  goal: string;
  mood: string;
  lastThought: string;
  lastAction: string;
  lastDialogue: string | null;
  relationships: Record<string, string>;
  memories: MemoryEntry[];
  color: string;
}

export interface WorldEvent {
  id: string;
  tick: number;
  actorId: AgentId;
  actorName: string;
  type: EventType;
  summary: string;
  detail: string;
  locationId: LocationId;
  dialogue: string | null;
}

export interface SimulationState {
  tick: number;
  mode: SimulationMode;
  worldPremise: string;
  locations: LocationDefinition[];
  agents: AgentState[];
  timeline: WorldEvent[];
  lastUpdatedAt: string;
}

export const locations: LocationDefinition[] = [
  {
    id: 'town-square',
    name: 'Town Square',
    description: 'A sun-warmed plaza with a fountain, a bulletin board, and room to linger.',
    neighbors: ['cafe', 'garden', 'studio'],
    accent: '#f29e4c',
  },
  {
    id: 'cafe',
    name: 'Signal Cafe',
    description: 'A quiet cafe where ideas, notebooks, and gossip collect around small tables.',
    neighbors: ['town-square', 'garden'],
    accent: '#f26ca7',
  },
  {
    id: 'garden',
    name: 'Glass Garden',
    description: 'A greenhouse path filled with herbs, humidity, and enough calm to think clearly.',
    neighbors: ['town-square', 'cafe', 'studio'],
    accent: '#56c596',
  },
  {
    id: 'studio',
    name: 'Echo Studio',
    description: 'A converted workshop packed with synths, cables, microphones, and half-finished sketches.',
    neighbors: ['town-square', 'garden'],
    accent: '#3da9fc',
  },
];
