import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import avaReactAWalkStrip from './assets/ava-react-a-walk.png';
import ellisAccountingWalkStrip from './assets/ellis-accounting-walk.png';
import jeremyWalkStrip from './assets/jeremy-walk.png';
import juneLiaisonWalkStrip from './assets/june-liaison-walk.png';
import miloReactBWalkStrip from './assets/milo-react-b-walk.png';
import niaServiceWalkStrip from './assets/nia-service-walk.png';
import officeMap from './assets/office-map-v2.png';
import petraQualityWalkStrip from './assets/petra-quality-walk.png';
import rowanManagerWalkStrip from './assets/rowan-manager-walk.png';
import samWalkStrip from './assets/sam-walk.png';
import defaultLayoutJson from './default-layout.json';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_TICKS,
  buildGridColumns,
  buildNavigationGrid,
  cellCenter,
  closestWalkableIndex,
  createEmptyNavigationGrid,
  directionBetween,
  findPath,
  gridIndexForPoint,
  locationById,
  normalizeOfficeLocations,
  officeLocations,
  type ActorId,
  type Direction,
  type NavigationGrid,
  type OfficeLocation,
} from './officeNavigation';

type ThoughtPlacement = 'left' | 'center' | 'right';
type AppView = 'office' | 'dashboard';
type LocalRunState = 'running' | 'paused';

interface TaskThought {
  title: string;
  checklist: string[];
}

interface ActorProfile {
  id: ActorId;
  strip: string;
  startLocationId: string;
  thought: TaskThought;
}

interface StaffProfile {
  id: string;
  name: string;
  position: string;
  locationId: string;
  strip: string;
  bio: string;
  direction: Direction;
  animationOffset: number;
}

interface RouteState {
  cell: number;
  nextCell: number | null;
  moveProgress: number;
  x: number;
  y: number;
  direction: Direction;
  frameIndex: number;
  destinationId: string | null;
  targetCell: number | null;
  currentLocationId: string | null;
  path: number[];
  scriptQueue: string[];
  testCellQueue: number[];
  waitTicksRemaining: number;
  backendPlanVersion: number;
}

interface WorldState {
  tick: number;
  testing: boolean;
  actors: Record<ActorId, RouteState>;
}

interface StaffTestState {
  tick: number;
  testing: boolean;
  movers: Record<string, RouteState>;
}

interface ApiRunnerStatus {
  state: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  pid: number | null;
}

interface ApiRunnerSnapshot {
  status: ApiRunnerStatus;
  logs: Array<{ timestamp: string; source: string; line: string }>;
}

interface ApiMeta {
  live: boolean;
  transport: 'local' | 'direct' | 'proxy';
  model: string | null;
}

interface ApiUsageSnapshot {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byModel?: Array<{
    model: string;
    requestCount: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
}

interface ApiMemoryItem {
  id: string;
  summary: string;
  kind: string;
}

interface ApiRequestSummary {
  id: string;
  kind: string;
  status: string;
  title: string;
  counterpartId: string;
  counterpartName: string;
  updatedAt: string;
}

interface ApiPerformanceStats {
  completedPlans: number;
  reviewRejections: number;
  approvalsGiven: number;
  approvalsReceived: number;
  escalations: number;
  investigations: number;
  corrections: number;
  qualityScore: number;
}

interface ApiOfficeRequest {
  id: string;
  kind: string;
  title: string;
  details: string;
  fromId: string;
  toId: string;
  locationId: string;
  status: string;
  updatedAt: string;
}

interface ApiTerminalItem {
  id: string;
  title: string;
  summary: string;
  fromId: string;
  priority: string;
  status: string;
  locationId: string;
}

interface ApiPlaybookRule {
  id: string;
  title: string;
  summary: string;
}

interface ApiKnowledgeNote {
  id: string;
  title: string;
  summary: string;
}

interface ApiEmployeeState {
  id: string;
  name: string;
  position: string;
  department?: string;
  assignedLocationId: string;
  supervisorId?: string | null;
  preferredModel?: string | null;
  currentLocationId: string;
  targetLocationId: string | null;
  phase: string;
  bio: string;
  status: string;
  taskTitle: string;
  objective?: string;
  checklist: string[];
  scriptQueue: string[];
  planVersion: number;
  lastUpdatedAt: string;
  currentAction?: string | null;
  currentActionType?: string | null;
  currentEmailSubject?: string | null;
  privateNoteCount?: number;
  activeMemory?: ApiMemoryItem[];
  passiveMemoryCount?: number;
  inboundRequests?: ApiRequestSummary[];
  outboundRequests?: ApiRequestSummary[];
  performance?: ApiPerformanceStats;
}

interface ApiEmployeeSnapshot {
  mode: 'live' | 'local';
  employees: ApiEmployeeState[];
  usage: ApiUsageSnapshot;
  requests?: ApiOfficeRequest[];
  terminal?: {
    items: ApiTerminalItem[];
    openCount: number;
  };
  playbook?: ApiPlaybookRule[];
  knowledgeBase?: ApiKnowledgeNote[];
  emailSimulator?: {
    inboxCount: number;
    sentCount: number;
    pendingSubjects: string[];
  };
  summary?: {
    pendingRequests: number;
    openTerminal: number;
    employeesWorking: number;
    employeesWaiting: number;
  };
}

interface EmployeeSyncEntry {
  id: string;
  currentLocationId: string;
}

interface GridCell {
  index: number;
  col: number;
  row: number;
  centerX: number;
  centerY: number;
  style: CSSProperties;
}

interface PanelPosition {
  x: number;
  y: number;
}

interface PanelDragState {
  offsetX: number;
  offsetY: number;
}

interface LayoutPayload {
  version: number;
  mapWidth: number;
  mapHeight: number;
  cellSize: number;
  walkableIndices: number[];
  locations: OfficeLocation[];
  entranceIndex: number | null;
  exitIndex: number | null;
}

type ConsoleSection = 'walkways' | 'locations' | 'doors';
type ConsoleTool = 'add-walkway' | 'remove-walkway' | 'place-location' | 'place-entrance' | 'place-exit' | null;

const TICK_MS = 45;
const SPRITE_SIZE = 96;
const TEST_SCRIPT_LENGTH = 8;
const TEST_WAIT_TICKS = Math.max(1, Math.round(900 / TICK_MS));
const TEST_ENTRANCE_STAGGER_TICKS = 5;
const DEFAULT_SETTINGS_PANEL_POSITION: PanelPosition = { x: 20, y: 76 };
const LAYOUT_STORAGE_KEY = 'no-mans-ai-layout-v3';

const actorIds: ActorId[] = ['sam', 'jeremy'];
const DEPRECATED_LOCATION_IDS = new Set(['sam-desk', 'jeremy-desk', 'manager-office', 'terminal-liaison']);

const actorProfiles: Record<ActorId, ActorProfile> = {
  sam: {
    id: 'sam',
    strip: samWalkStrip,
    startLocationId: 'react-c',
    thought: {
      title: 'React C',
      checklist: ['Check queue', 'Review task board', 'Pair on front-end fix'],
    },
  },
  jeremy: {
    id: 'jeremy',
    strip: jeremyWalkStrip,
    startLocationId: 'react-d',
    thought: {
      title: 'React D',
      checklist: ['Check queue', 'Review blocker list', 'Pair on UI pass'],
    },
  },
};

const fixedStaffProfiles: StaffProfile[] = [];

const entranceLaunchOrder = ['sam', 'jeremy', ...fixedStaffProfiles.map((profile) => profile.id)] as const;
const unavailableRoster = ['Ava Kim', 'Milo Perez', 'Nia Solis', 'Ellis Hart', 'Rowan Pike', 'Petra Vale', 'June Mercer'];

function employeeById(snapshot: ApiEmployeeSnapshot | null, id: string) {
  return snapshot?.employees.find((employee) => employee.id === id) ?? null;
}

function requestStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'fulfilled':
      return 'Fulfilled';
    case 'escalated':
      return 'Escalated';
    default:
      return status;
  }
}

const directionFrames: Record<Direction, [number, number, number]> = {
  down: [0, 1, 2],
  up: [3, 4, 5],
  left: [6, 7, 8],
  right: [9, 10, 11],
};

function cloneLocations(locations: OfficeLocation[]) {
  return locations.map((location) => ({
    ...location,
    marker: { ...location.marker },
    targets: {
      sam: { ...location.targets.sam },
      jeremy: { ...location.targets.jeremy },
    },
  }));
}

function entranceLaunchDelayTicks(id: string) {
  const index = entranceLaunchOrder.indexOf(id as (typeof entranceLaunchOrder)[number]);
  return index < 0 ? 0 : index * TEST_ENTRANCE_STAGGER_TICKS;
}

function crowdOffset(index: number, total: number) {
  if (total <= 1) {
    return { x: 0, y: 0 };
  }

  if (total === 2) {
    return [
      { x: -18, y: 0 },
      { x: 18, y: 0 },
    ][index] ?? { x: 0, y: 0 };
  }

  if (total === 3) {
    return [
      { x: 0, y: -14 },
      { x: -20, y: 12 },
      { x: 20, y: 12 },
    ][index] ?? { x: 0, y: 0 };
  }

  if (total === 4) {
    return [
      { x: -18, y: -8 },
      { x: 18, y: -8 },
      { x: -18, y: 16 },
      { x: 18, y: 16 },
    ][index] ?? { x: 0, y: 0 };
  }

  if (total === 5) {
    return [
      { x: 0, y: -16 },
      { x: -22, y: -2 },
      { x: 22, y: -2 },
      { x: -14, y: 18 },
      { x: 14, y: 18 },
    ][index] ?? { x: 0, y: 0 };
  }

  const columns = Math.min(3, total);
  const row = Math.floor(index / columns);
  const col = index % columns;
  const spreadX = 22;
  const spreadY = 18;

  return {
    x: (col - (columns - 1) / 2) * spreadX,
    y: row * spreadY - (row === 0 ? 12 : 0),
  };
}

function idleFrame(direction: Direction) {
  return directionFrames[direction][1];
}

function walkingFrame(direction: Direction, tick: number) {
  const [leftStep, idle, rightStep] = directionFrames[direction];
  const cycle = [idle, leftStep, idle, rightStep];
  return cycle[tick % cycle.length];
}

function fixedStaffFrame(direction: Direction, tick: number, offset: number) {
  const slowTick = Math.floor((tick + offset) / 3);
  return walkingFrame(direction, slowTick);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function getSpriteStyle(strip: string, frameIndex: number): CSSProperties {
  return {
    backgroundImage: `url(${strip})`,
    backgroundPosition: `${(frameIndex / 11) * 100}% 0%`,
    backgroundSize: '1200% 100%',
  };
}

function gridCellStyle(x: number, y: number, width: number, height: number): CSSProperties {
  return {
    left: `${(x / MAP_WIDTH) * 100}%`,
    top: `${(y / MAP_HEIGHT) * 100}%`,
    width: `${(width / MAP_WIDTH) * 100}%`,
    height: `${(height / MAP_HEIGHT) * 100}%`,
  };
}

function actorStyle(x: number, y: number, spriteSize = SPRITE_SIZE) {
  return {
    left: `${(x / MAP_WIDTH) * 100}%`,
    top: `${(y / MAP_HEIGHT) * 100}%`,
    '--sprite-size': `${spriteSize}px`,
    zIndex: Math.round(y),
  } as CSSProperties;
}

function thoughtPlacement(x: number): ThoughtPlacement {
  const ratio = x / MAP_WIDTH;
  if (ratio < 0.16) {
    return 'left';
  }
  if (ratio > 0.84) {
    return 'right';
  }
  return 'center';
}

function buildGridCells(grid: NavigationGrid): GridCell[] {
  const cells: GridCell[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const index = row * grid.cols + col;
      const x = col * grid.cellSize;
      const y = row * grid.cellSize;
      const width = Math.min(grid.cellSize, MAP_WIDTH - x);
      const height = Math.min(grid.cellSize, MAP_HEIGHT - y);

      cells.push({
        index,
        col,
        row,
        centerX: x + width / 2,
        centerY: y + height / 2,
        style: gridCellStyle(x, y, width, height),
      });
    }
  }

  return cells;
}

function exactCellIndexForPoint(grid: NavigationGrid, point: { x: number; y: number }) {
  return gridIndexForPoint(grid, point);
}

function serializeWalkableIndices(grid: NavigationGrid) {
  const indices: number[] = [];

  for (let index = 0; index < grid.walkable.length; index += 1) {
    if (grid.walkable[index] === 1) {
      indices.push(index);
    }
  }

  return indices;
}

function buildNavigationFromSelectedIndices(selectedIndices: number[]) {
  const baseGrid = createEmptyNavigationGrid();
  const walkable = new Uint8Array(baseGrid.walkable.length);

  for (const index of selectedIndices) {
    if (index >= 0 && index < walkable.length) {
      walkable[index] = 1;
    }
  }

  return {
    ...baseGrid,
    walkable,
  };
}

function defaultDoorIndices(grid: NavigationGrid) {
  return {
    entranceIndex: closestWalkableIndex(grid, { x: 0, y: MAP_HEIGHT * 0.72 }),
    exitIndex: closestWalkableIndex(grid, { x: MAP_WIDTH - 1, y: MAP_HEIGHT * 0.72 }),
  };
}

function slugifyLocationId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Number.isFinite((value as { x?: unknown }).x) &&
      Number.isFinite((value as { y?: unknown }).y),
  );
}

function isOfficeLocationArray(value: unknown): value is OfficeLocation[] {
  return (
    Array.isArray(value) &&
    value.every((location) => {
      if (!location || typeof location !== 'object') {
        return false;
      }

      const candidate = location as Partial<OfficeLocation>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.label === 'string' &&
        isPoint(candidate.marker) &&
        Boolean(candidate.targets) &&
        isPoint(candidate.targets?.sam) &&
        isPoint(candidate.targets?.jeremy)
      );
    })
  );
}

function normalizeDoorIndex(
  grid: NavigationGrid,
  candidateIndex: number | null | undefined,
  fallbackPoint: { x: number; y: number },
) {
  if (
    typeof candidateIndex === 'number' &&
    Number.isInteger(candidateIndex) &&
    candidateIndex >= 0 &&
    candidateIndex < grid.walkable.length &&
    grid.walkable[candidateIndex] === 1
  ) {
    return candidateIndex;
  }

  return closestWalkableIndex(grid, fallbackPoint);
}

function collectReachableCells(grid: NavigationGrid, startCell: number) {
  const reachable = new Set<number>();

  if (startCell < 0 || startCell >= grid.walkable.length || grid.walkable[startCell] !== 1) {
    return reachable;
  }

  const queue = [startCell];
  reachable.add(startCell);

  while (queue.length > 0) {
    const cell = queue.shift();
    if (cell === undefined) {
      continue;
    }

    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);
    const neighbors = [
      { col: col + 1, row },
      { col: col - 1, row },
      { col, row: row + 1 },
      { col, row: row - 1 },
    ];

    for (const neighbor of neighbors) {
      if (neighbor.col < 0 || neighbor.col >= grid.cols || neighbor.row < 0 || neighbor.row >= grid.rows) {
        continue;
      }

      const neighborIndex = neighbor.row * grid.cols + neighbor.col;
      if (grid.walkable[neighborIndex] !== 1 || reachable.has(neighborIndex)) {
        continue;
      }

      reachable.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  return reachable;
}

function closestReachableIndex(grid: NavigationGrid, point: { x: number; y: number }, reachable: Set<number>) {
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const index of reachable) {
    const center = cellCenter(grid, index);
    const dx = center.x - point.x;
    const dy = center.y - point.y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function normalizeReachableLocations(grid: NavigationGrid, locations: OfficeLocation[], originCell: number | null) {
  if (originCell === null) {
    return cloneLocations(locations);
  }

  const reachable = collectReachableCells(grid, originCell);
  if (reachable.size === 0) {
    return cloneLocations(locations);
  }

  return locations.map((location) => {
    const markerIndex = closestReachableIndex(grid, location.marker, reachable);
    const samIndex = closestReachableIndex(grid, location.targets.sam, reachable);
    const jeremyIndex = closestReachableIndex(grid, location.targets.jeremy, reachable);

    return {
      ...location,
      marker: markerIndex === null ? location.marker : cellCenter(grid, markerIndex),
      targets: {
        sam: samIndex === null ? location.targets.sam : cellCenter(grid, samIndex),
        jeremy: jeremyIndex === null ? location.targets.jeremy : cellCenter(grid, jeremyIndex),
      },
    };
  });
}

function coerceLayoutPayload(payload: Partial<LayoutPayload> | null | undefined, fallbackLocations = officeLocations) {
  const fallbackNavigation = buildNavigationGrid();
  const fallbackDoors = defaultDoorIndices(fallbackNavigation);

  if (
    !payload ||
    payload.version !== 2 ||
    payload.mapWidth !== MAP_WIDTH ||
    payload.mapHeight !== MAP_HEIGHT ||
    payload.cellSize !== fallbackNavigation.cellSize ||
    !Array.isArray(payload.walkableIndices) ||
    !isOfficeLocationArray(payload.locations)
  ) {
    const normalizedLocations = cloneLocations(normalizeOfficeLocations(fallbackNavigation, fallbackLocations));
    const locations = normalizeReachableLocations(fallbackNavigation, normalizedLocations, fallbackDoors.entranceIndex);
    return {
      navigation: fallbackNavigation,
      locations,
      entranceIndex: fallbackDoors.entranceIndex,
      exitIndex: fallbackDoors.exitIndex,
    };
  }

  const navigation = buildNavigationFromSelectedIndices(payload.walkableIndices.filter((index) => Number.isInteger(index)));
  const normalizedLocations = cloneLocations(normalizeOfficeLocations(navigation, payload.locations));
  const entranceIndex = normalizeDoorIndex(navigation, payload.entranceIndex, { x: 0, y: MAP_HEIGHT * 0.72 });
  const exitIndex = normalizeDoorIndex(navigation, payload.exitIndex, { x: MAP_WIDTH - 1, y: MAP_HEIGHT * 0.72 });
  const locations = normalizeReachableLocations(navigation, normalizedLocations, entranceIndex);

  return {
    navigation,
    locations,
    entranceIndex,
    exitIndex,
  };
}

function createDefaultLayout() {
  return coerceLayoutPayload(defaultLayoutJson as Partial<LayoutPayload>);
}

function loadStoredLayout() {
  const fallback = createDefaultLayout();

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<LayoutPayload>;
    return coerceLayoutPayload(parsed, fallback.locations);
  } catch {
    return fallback;
  }
}

function createRouteState(grid: NavigationGrid, point: { x: number; y: number }, direction: Direction, currentLocationId: string): RouteState {
  const cell = closestWalkableIndex(grid, point);
  const center = cellCenter(grid, cell);

  return {
    cell,
    nextCell: null,
    moveProgress: 0,
    x: center.x,
    y: center.y,
    direction,
    frameIndex: idleFrame(direction),
    destinationId: null,
    targetCell: null,
    currentLocationId,
    path: [],
    scriptQueue: [],
    testCellQueue: [],
    waitTicksRemaining: 0,
    backendPlanVersion: 0,
  };
}

function resetRouteToCell<T extends RouteState>(
  route: T,
  grid: NavigationGrid,
  cell: number,
  direction: Direction,
  currentLocationId: string | null,
  scriptQueue: string[] = [],
  waitTicksRemaining = 0,
) {
  const center = cellCenter(grid, cell);
  return {
    ...route,
    cell,
    nextCell: null,
    moveProgress: 0,
    x: center.x,
    y: center.y,
    direction,
    frameIndex: idleFrame(direction),
    destinationId: null,
    targetCell: null,
    currentLocationId,
    path: [],
    scriptQueue,
    testCellQueue: [],
    waitTicksRemaining,
  };
}

function createWorldState(grid: NavigationGrid, locations: OfficeLocation[]): WorldState {
  const samLocation = locationById(actorProfiles.sam.startLocationId, locations) ?? locations[0] ?? null;
  const jeremyLocation = locationById(actorProfiles.jeremy.startLocationId, locations) ?? locations[0] ?? null;

  return {
    tick: 0,
    testing: false,
    actors: {
      sam: createRouteState(grid, samLocation?.targets.sam ?? { x: 0, y: 0 }, 'right', samLocation?.id ?? ''),
      jeremy: createRouteState(grid, jeremyLocation?.targets.jeremy ?? { x: 0, y: 0 }, 'left', jeremyLocation?.id ?? ''),
    },
  };
}

function createStaffTestState(grid: NavigationGrid, locations: OfficeLocation[]): StaffTestState {
  const movers = Object.fromEntries(
    fixedStaffProfiles.map((profile) => {
      const startLocation = locationById(profile.locationId, locations) ?? locations[0] ?? null;
      return [profile.id, createRouteState(grid, startLocation?.marker ?? { x: 0, y: 0 }, profile.direction, startLocation?.id ?? '')] as const;
    }),
  ) as Record<string, RouteState>;

  return {
    tick: 0,
    testing: false,
    movers,
  };
}

function remapWorldToGrid(world: WorldState, grid: NavigationGrid, locations: OfficeLocation[]): WorldState {
  const actors = {} as Record<ActorId, RouteState>;

  for (const actorId of actorIds) {
    const actor = world.actors[actorId];
    const cell = closestWalkableIndex(grid, { x: actor.x, y: actor.y });
    const center = cellCenter(grid, cell);
    const currentLocationId = actor.currentLocationId && locationById(actor.currentLocationId, locations) ? actor.currentLocationId : null;
    const destinationId = actor.destinationId && locationById(actor.destinationId, locations) ? actor.destinationId : null;

    actors[actorId] = {
      ...actor,
      cell,
      nextCell: null,
      moveProgress: 0,
      x: center.x,
      y: center.y,
      destinationId,
      targetCell: null,
      currentLocationId,
      path: [],
      scriptQueue: [],
      testCellQueue: [],
      waitTicksRemaining: 0,
      frameIndex: idleFrame(actor.direction),
      backendPlanVersion: actor.backendPlanVersion,
    };
  }

  return {
    ...world,
    testing: false,
    actors,
  };
}

function remapStaffTestToGrid(current: StaffTestState, grid: NavigationGrid, locations: OfficeLocation[]): StaffTestState {
  const movers = Object.fromEntries(
    fixedStaffProfiles.map((profile) => {
      const existing = current.movers[profile.id];
      const fallback = locationById(profile.locationId, locations)?.marker ?? { x: 0, y: 0 };
      const cell = closestWalkableIndex(grid, existing ? { x: existing.x, y: existing.y } : fallback);
      const center = cellCenter(grid, cell);

      return [
        profile.id,
        {
          ...(existing ?? createRouteState(grid, fallback, profile.direction, profile.locationId)),
          cell,
          nextCell: null,
          moveProgress: 0,
          x: center.x,
          y: center.y,
          destinationId: null,
          targetCell: null,
          currentLocationId: existing?.currentLocationId ?? profile.locationId,
          path: [],
          scriptQueue: [],
          testCellQueue: [],
          waitTicksRemaining: 0,
          frameIndex: idleFrame(existing?.direction ?? profile.direction),
          backendPlanVersion: existing?.backendPlanVersion ?? 0,
        },
      ] as const;
    }),
  ) as Record<string, RouteState>;

  return {
    ...current,
    testing: false,
    movers,
  };
}

function finishArrival<T extends RouteState>(route: T, destinationId: string): T {
  return {
    ...route,
    destinationId: null,
    targetCell: null,
    currentLocationId: destinationId,
    path: [],
    waitTicksRemaining: TEST_WAIT_TICKS,
    frameIndex: idleFrame(route.direction),
  };
}

function stepMovingRoute<T extends RouteState>(route: T, tick: number, grid: NavigationGrid): T {
  if (route.nextCell === null) {
    const center = cellCenter(grid, route.cell);
    if (route.waitTicksRemaining > 0) {
      return {
        ...route,
        x: center.x,
        y: center.y,
        waitTicksRemaining: route.waitTicksRemaining - 1,
        frameIndex: idleFrame(route.direction),
      };
    }

    return {
      ...route,
      x: center.x,
      y: center.y,
      frameIndex: idleFrame(route.direction),
    };
  }

  const nextProgress = route.moveProgress + 1;
  const start = cellCenter(grid, route.cell);
  const end = cellCenter(grid, route.nextCell);
  const t = Math.min(nextProgress / TILE_TICKS, 1);
  const moving = {
    ...route,
    moveProgress: nextProgress,
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
    frameIndex: walkingFrame(route.direction, tick + nextProgress),
  };

  if (nextProgress < TILE_TICKS) {
    return moving;
  }

  const arrivedCell = route.nextCell;
  const center = cellCenter(grid, arrivedCell);

  return {
    ...moving,
    cell: arrivedCell,
    nextCell: null,
    moveProgress: 0,
    x: center.x,
    y: center.y,
    path: route.path.slice(1),
    frameIndex: idleFrame(route.direction),
  };
}

function primeQueuedDestination<T extends RouteState>(route: T): T {
  if (route.nextCell !== null || route.destinationId !== null || route.targetCell !== null || route.waitTicksRemaining > 0) {
    return route;
  }

  if (route.testCellQueue.length > 0) {
    const [nextCell, ...remainingQueue] = route.testCellQueue;
    return {
      ...route,
      targetCell: nextCell ?? null,
      testCellQueue: remainingQueue,
    };
  }

  if (route.scriptQueue.length === 0) {
    return route;
  }

  const [nextDestination, ...remainingQueue] = route.scriptQueue;
  return {
    ...route,
    destinationId: nextDestination ?? null,
    scriptQueue: remainingQueue,
  };
}

function planRouteStep<T extends RouteState>(
  route: T,
  tick: number,
  grid: NavigationGrid,
  goalCell: number | null,
  blocked: Set<number>,
): T {
  if (route.nextCell !== null || (route.destinationId === null && route.targetCell === null)) {
    return route;
  }

  const resolvedGoalCell = route.targetCell ?? goalCell;

  if (resolvedGoalCell === null) {
    return {
      ...route,
      destinationId: null,
      targetCell: null,
      path: [],
      frameIndex: idleFrame(route.direction),
    };
  }

  if (route.cell === resolvedGoalCell) {
    if (route.destinationId) {
      return finishArrival(route, route.destinationId);
    }

    return {
      ...route,
      targetCell: null,
      path: [],
      waitTicksRemaining: TEST_WAIT_TICKS,
      frameIndex: idleFrame(route.direction),
    };
  }

  const path = findPath(grid, route.cell, resolvedGoalCell, blocked);
  const nextCell = path[0];
  if (nextCell === undefined || blocked.has(nextCell)) {
    return {
      ...route,
      path,
      frameIndex: idleFrame(route.direction),
    };
  }

  const direction = directionBetween(grid, route.cell, nextCell);
  const start = cellCenter(grid, route.cell);
  const end = cellCenter(grid, nextCell);

  return {
    ...route,
    path,
    direction,
    nextCell,
    moveProgress: 1,
    frameIndex: walkingFrame(direction, tick),
    x: lerp(start.x, end.x, 1 / TILE_TICKS),
    y: lerp(start.y, end.y, 1 / TILE_TICKS),
  };
}

function actorGoalCell(grid: NavigationGrid, actorId: ActorId, destinationId: string, locations: OfficeLocation[]) {
  const location = locationById(destinationId, locations);
  if (!location) {
    return null;
  }

  return closestWalkableIndex(grid, location.targets[actorId]);
}

function staffGoalCell(grid: NavigationGrid, destinationId: string, locations: OfficeLocation[]) {
  const location = locationById(destinationId, locations);
  if (!location) {
    return null;
  }

  return closestWalkableIndex(grid, location.marker);
}

function buildRandomScripts(world: WorldState, locations: OfficeLocation[]) {
  const samQueue: string[] = [];
  const jeremyQueue: string[] = [];
  let lastSam = world.actors.sam.currentLocationId ?? actorProfiles.sam.startLocationId;
  let lastJeremy = world.actors.jeremy.currentLocationId ?? actorProfiles.jeremy.startLocationId;

  for (let index = 0; index < TEST_SCRIPT_LENGTH; index += 1) {
    const samChoices = locations.filter((location) => location.id !== lastSam);
    const samChoice = samChoices[Math.floor(Math.random() * samChoices.length)];

    const jeremyChoices = locations.filter((location) => location.id !== lastJeremy && location.id !== samChoice.id);
    const jeremyPool = jeremyChoices.length > 0 ? jeremyChoices : locations.filter((location) => location.id !== lastJeremy);
    const jeremyChoice = jeremyPool[Math.floor(Math.random() * jeremyPool.length)];

    samQueue.push(samChoice.id);
    jeremyQueue.push(jeremyChoice.id);
    lastSam = samChoice.id;
    lastJeremy = jeremyChoice.id;
  }

  return { samQueue, jeremyQueue };
}

function shuffleArray<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildTestLocationQueue(currentLocationId: string | null, locations: OfficeLocation[]) {
  const locationIds = locations
    .map((location) => location.id)
    .filter((locationId) => locationId !== currentLocationId);

  return shuffleArray(locationIds);
}

function refillTestQueue<T extends RouteState>(route: T, locations: OfficeLocation[]) {
  if (
    route.nextCell !== null ||
    route.destinationId !== null ||
    route.targetCell !== null ||
    route.waitTicksRemaining > 0 ||
    route.scriptQueue.length > 0 ||
    route.testCellQueue.length > 0
  ) {
    return route;
  }

  return {
    ...route,
    scriptQueue: buildTestLocationQueue(route.currentLocationId, locations),
  };
}

function stepWorld(current: WorldState, grid: NavigationGrid, locations: OfficeLocation[]): WorldState {
  const actors: Record<ActorId, RouteState> = {
    sam: stepMovingRoute(
      { ...current.actors.sam, path: [...current.actors.sam.path], scriptQueue: [...current.actors.sam.scriptQueue], testCellQueue: [...current.actors.sam.testCellQueue] },
      current.tick,
      grid,
    ),
    jeremy: stepMovingRoute(
      { ...current.actors.jeremy, path: [...current.actors.jeremy.path], scriptQueue: [...current.actors.jeremy.scriptQueue], testCellQueue: [...current.actors.jeremy.testCellQueue] },
      current.tick,
      grid,
    ),
  };

  if (current.testing) {
    for (const actorId of actorIds) {
      actors[actorId] = refillTestQueue(actors[actorId], locations);
    }
  }

  for (const actorId of actorIds) {
    actors[actorId] = primeQueuedDestination(actors[actorId]);
  }

  const reserved = new Set<number>();
  for (const actorId of actorIds) {
    const actor = actors[actorId];
    reserved.add(actor.cell);
    if (actor.nextCell !== null) {
      reserved.add(actor.nextCell);
    }
  }

  const planningOrder = current.tick % 2 === 0 ? actorIds : [...actorIds].reverse();

  for (const actorId of planningOrder) {
    const actor = actors[actorId];
    if (actor.nextCell !== null || (actor.destinationId === null && actor.targetCell === null)) {
      continue;
    }

    const goalCell = actor.targetCell ?? (actor.destinationId ? actorGoalCell(grid, actorId, actor.destinationId, locations) : null);
    const blocked = new Set<number>();
    if (actor.targetCell === null) {
      for (const otherId of actorIds) {
        if (otherId === actorId) {
          continue;
        }

        blocked.add(actors[otherId].cell);
        if (actors[otherId].nextCell !== null) {
          blocked.add(actors[otherId].nextCell);
        }
      }

      for (const reservedCell of reserved) {
        blocked.add(reservedCell);
      }
    }

    if (goalCell !== null) {
      blocked.delete(goalCell);
    }
    blocked.delete(actor.cell);

    const nextActor = planRouteStep(actor, current.tick, grid, goalCell, blocked);
    actors[actorId] = nextActor;
    if (nextActor.nextCell !== null) {
      reserved.add(nextActor.nextCell);
    }
  }

  return {
    tick: current.tick + 1,
    testing: current.testing,
    actors,
  };
}

function stepStaffTest(current: StaffTestState, grid: NavigationGrid, locations: OfficeLocation[]): StaffTestState {
  const movers = Object.fromEntries(
    Object.entries(current.movers).map(([id, mover]) => [
      id,
      stepMovingRoute({ ...mover, path: [...mover.path], scriptQueue: [...mover.scriptQueue], testCellQueue: [...mover.testCellQueue] }, current.tick, grid),
    ]),
  ) as Record<string, RouteState>;

  const moverIds = Object.keys(movers);

  if (current.testing) {
    for (const moverId of moverIds) {
      movers[moverId] = refillTestQueue(movers[moverId], locations);
    }
  }

  for (const moverId of moverIds) {
    movers[moverId] = primeQueuedDestination(movers[moverId]);
  }

  const reserved = new Set<number>();
  for (const moverId of moverIds) {
    const mover = movers[moverId];
    reserved.add(mover.cell);
    if (mover.nextCell !== null) {
      reserved.add(mover.nextCell);
    }
  }

  const planningOrder = current.tick % 2 === 0 ? moverIds : [...moverIds].reverse();

  for (const moverId of planningOrder) {
    const mover = movers[moverId];
    if (mover.nextCell !== null || (mover.destinationId === null && mover.targetCell === null)) {
      continue;
    }

    const goalCell = mover.targetCell ?? (mover.destinationId ? staffGoalCell(grid, mover.destinationId, locations) : null);
    const blocked = new Set<number>();
    if (mover.targetCell === null) {
      for (const otherId of moverIds) {
        if (otherId === moverId) {
          continue;
        }

        blocked.add(movers[otherId].cell);
        if (movers[otherId].nextCell !== null) {
          blocked.add(movers[otherId].nextCell);
        }
      }

      for (const reservedCell of reserved) {
        blocked.add(reservedCell);
      }
    }

    if (goalCell !== null) {
      blocked.delete(goalCell);
    }
    blocked.delete(mover.cell);

    const nextMover = planRouteStep(mover, current.tick, grid, goalCell, blocked);
    movers[moverId] = nextMover;
    if (nextMover.nextCell !== null) {
      reserved.add(nextMover.nextCell);
    }
  }

  return {
    tick: current.tick + 1,
    testing: current.testing,
    movers,
  };
}

function actorStatusText(actor: RouteState, locations: OfficeLocation[]) {
  if (actor.targetCell !== null) {
    return 'Running test route';
  }

  if (actor.waitTicksRemaining > 0) {
    return 'Waiting on test route';
  }

  if (actor.destinationId) {
    const destination = locationById(actor.destinationId, locations);
    return destination ? `Walking to ${destination.label}` : 'Walking';
  }

  if (actor.currentLocationId) {
    const current = locationById(actor.currentLocationId, locations);
    if (current) {
      return `Holding at ${current.label}`;
    }
  }

  return 'Idle';
}

function staffStatusText(mover: RouteState | undefined, staff: StaffProfile, locations: OfficeLocation[]) {
  if (!mover) {
    return `Holding at ${locationById(staff.locationId, locations)?.label ?? staff.position}`;
  }

  if (mover.targetCell !== null) {
    return 'Running test route';
  }

  if (mover.waitTicksRemaining > 0) {
    return 'Waiting on test route';
  }

  if (mover.destinationId) {
    const destination = locationById(mover.destinationId, locations);
    return destination ? `Walking to ${destination.label}` : 'Walking';
  }

  const current = mover.currentLocationId ? locationById(mover.currentLocationId, locations) : locationById(staff.locationId, locations);
  return `Holding at ${current?.label ?? staff.position}`;
}

function buildEmployeeSyncEntries(
  world: WorldState,
  staffTest: StaffTestState,
  locations: OfficeLocation[],
) {
  const entries: EmployeeSyncEntry[] = [
    {
      id: 'sam',
      currentLocationId: world.actors.sam.currentLocationId ?? actorProfiles.sam.startLocationId,
    },
    {
      id: 'jeremy',
      currentLocationId: world.actors.jeremy.currentLocationId ?? actorProfiles.jeremy.startLocationId,
    },
  ];

  for (const staff of fixedStaffProfiles) {
    const mover = staffTest.movers[staff.id];

    entries.push({
      id: staff.id,
      currentLocationId: mover?.currentLocationId ?? staff.locationId,
    });
  }

  return entries;
}

function reconcileRouteWithBackend(
  route: RouteState,
  employee: ApiEmployeeState | null,
  grid: NavigationGrid,
  point: { x: number; y: number } | null,
) {
  if (!employee) {
    return route;
  }

  if (employee.planVersion <= route.backendPlanVersion) {
    return route;
  }

  if (
    route.nextCell !== null ||
    route.destinationId !== null ||
    route.targetCell !== null ||
    route.scriptQueue.length > 0 ||
    route.testCellQueue.length > 0 ||
    route.waitTicksRemaining > 0
  ) {
    return route;
  }

  if (!point) {
    return {
      ...route,
      currentLocationId: employee.currentLocationId,
      backendPlanVersion: employee.planVersion,
    };
  }

  const cell = closestWalkableIndex(grid, point);
  const center = cellCenter(grid, cell);

  return {
    ...route,
    cell,
    nextCell: null,
    moveProgress: 0,
    x: center.x,
    y: center.y,
    destinationId: null,
    targetCell: null,
    currentLocationId: employee.currentLocationId,
    path: [],
    scriptQueue: [...employee.scriptQueue],
    testCellQueue: [],
    waitTicksRemaining: 0,
    frameIndex: idleFrame(route.direction),
    backendPlanVersion: employee.planVersion,
  };
}

export default function App() {
  const gridOverlayRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<AppView>('office');
  const [localRunState, setLocalRunState] = useState<LocalRunState>('paused');
  const [navigation, setNavigation] = useState<NavigationGrid | null>(null);
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [staffTest, setStaffTest] = useState<StaffTestState | null>(null);
  const [apiSnapshot, setApiSnapshot] = useState<ApiRunnerSnapshot | null>(null);
  const [employeeSnapshot, setEmployeeSnapshot] = useState<ApiEmployeeSnapshot | null>(null);
  const [apiMeta, setApiMeta] = useState<ApiMeta | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consoleSection, setConsoleSection] = useState<ConsoleSection>('walkways');
  const [consoleTool, setConsoleTool] = useState<ConsoleTool>(null);
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [gridSelectionMode, setGridSelectionMode] = useState<'add' | 'remove' | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newLocationId, setNewLocationId] = useState('');
  const [entranceIndex, setEntranceIndex] = useState<number | null>(null);
  const [exitIndex, setExitIndex] = useState<number | null>(null);
  const [settingsPanelPosition, setSettingsPanelPosition] = useState<PanelPosition>(DEFAULT_SETTINGS_PANEL_POSITION);
  const [panelDragState, setPanelDragState] = useState<PanelDragState | null>(null);
  const gridCells = useMemo(() => (navigation ? buildGridCells(navigation) : []), [navigation]);
  const gridColumns = useMemo(() => (navigation ? buildGridColumns(navigation) : []), [navigation]);

  useEffect(() => {
    const layout = loadStoredLayout();
    setNavigation(layout.navigation);
    setLocations(layout.locations);
    setSelectedLocationId(layout.locations[0]?.id ?? null);
    setEntranceIndex(layout.entranceIndex);
    setExitIndex(layout.exitIndex);
    setWorld(createWorldState(layout.navigation, layout.locations));
    setStaffTest(createStaffTestState(layout.navigation, layout.locations));
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      setGridSelectionMode(null);
      setConsoleTool(null);
      return;
    }

    function stopSelection() {
      setGridSelectionMode(null);
    }

    window.addEventListener('pointerup', stopSelection);
    return () => {
      window.removeEventListener('pointerup', stopSelection);
    };
  }, [settingsOpen]);

  useEffect(() => {
    setSelectedLocationId((current) => current ?? locations[0]?.id ?? null);
  }, [locations]);

  useEffect(() => {
    if (!selectedLocationId || locations.some((location) => location.id === selectedLocationId)) {
      return;
    }

    setSelectedLocationId(locations[0]?.id ?? null);
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!panelDragState) {
      return;
    }

    const dragState = panelDragState;

    function handlePointerMove(event: PointerEvent) {
      setSettingsPanelPosition({
        x: Math.max(8, event.clientX - dragState.offsetX),
        y: Math.max(8, event.clientY - dragState.offsetY),
      });
    }

    function handlePointerUp() {
      setPanelDragState(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [panelDragState]);

  useEffect(() => {
    if (!navigation || locations.length === 0) {
      return;
    }

    const payload: LayoutPayload = {
      version: 2,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      cellSize: navigation.cellSize,
      walkableIndices: serializeWalkableIndices(navigation),
      locations: cloneLocations(locations),
      entranceIndex,
      exitIndex,
    };

    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  }, [entranceIndex, exitIndex, locations, navigation]);

  useEffect(() => {
    const shouldAnimate = localRunState === 'running' || apiSnapshot?.status.state === 'running';
    if (!navigation || !world || !staffTest || !shouldAnimate) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setWorld((current) => (current ? stepWorld(current, navigation, locations) : current));
      setStaffTest((current) => (current ? stepStaffTest(current, navigation, locations) : current));
    }, TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [apiSnapshot?.status.state, locations, localRunState, navigation, staffTest, world]);

  useEffect(() => {
    let cancelled = false;

    async function fetchApiStatus() {
      try {
        const fallbackMeta: ApiMeta = { live: false, transport: 'local', model: null };
        const [statusResponse, metaResponse, employeesResponse] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/meta'),
          fetch('/api/employees'),
        ]);
        if (!statusResponse.ok) {
          throw new Error(`Status failed: ${statusResponse.status}`);
        }

        const snapshot = (await statusResponse.json()) as ApiRunnerSnapshot;
        const meta = metaResponse.ok ? ((await metaResponse.json()) as ApiMeta) : fallbackMeta;
        const employees = employeesResponse.ok ? ((await employeesResponse.json()) as ApiEmployeeSnapshot) : null;

        if (!cancelled) {
          setApiSnapshot(snapshot);
          setEmployeeSnapshot(employees);
          setApiMeta(meta);
          setApiConnected(true);
        }
      } catch {
        if (!cancelled) {
          setApiMeta(null);
          setApiConnected(false);
        }
      }
    }

    void fetchApiStatus();
    const intervalId = window.setInterval(() => {
      void fetchApiStatus();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!employeeSnapshot || !navigation || !world || !staffTest) {
      return;
    }

    if (world.testing || staffTest.testing) {
      return;
    }

    setWorld((current) => {
      if (!current) {
        return current;
      }

      const samEmployee = employeeById(employeeSnapshot, 'sam');
      const jeremyEmployee = employeeById(employeeSnapshot, 'jeremy');

      return {
        ...current,
        actors: {
          sam: reconcileRouteWithBackend(
            current.actors.sam,
            samEmployee,
            navigation,
            locationById(samEmployee?.currentLocationId ?? '', locations)?.targets.sam ?? null,
          ),
          jeremy: reconcileRouteWithBackend(
            current.actors.jeremy,
            jeremyEmployee,
            navigation,
            locationById(jeremyEmployee?.currentLocationId ?? '', locations)?.targets.jeremy ?? null,
          ),
        },
      };
    });

    setStaffTest((current) => {
      if (!current) {
        return current;
      }

      const movers = Object.fromEntries(
        fixedStaffProfiles.map((profile) => {
          const employee = employeeById(employeeSnapshot, profile.id);
          return [
            profile.id,
            reconcileRouteWithBackend(
              current.movers[profile.id],
              employee,
              navigation,
              locationById(employee?.currentLocationId ?? '', locations)?.marker ?? null,
            ),
          ] as const;
        }),
      ) as Record<string, RouteState>;

      return {
        ...current,
        movers,
      };
    });
  }, [employeeSnapshot, locations, navigation]);

  function runTest() {
    if (!navigation || locations.length < 2) {
      return;
    }

    const fallbackDoors = defaultDoorIndices(navigation);
    const entryCell = entranceIndex ?? fallbackDoors.entranceIndex;

    setWorld((current) => {
      if (!current) {
        return current;
      }

      const samStart = actorProfiles.sam.startLocationId;
      const jeremyStart = actorProfiles.jeremy.startLocationId;

      return {
        ...current,
        testing: true,
        actors: {
          sam: resetRouteToCell(
            current.actors.sam,
            navigation,
            entryCell,
            'right',
            null,
            [samStart, ...buildTestLocationQueue(samStart, locations)],
            entranceLaunchDelayTicks('sam'),
          ),
          jeremy: resetRouteToCell(
            current.actors.jeremy,
            navigation,
            entryCell,
            'right',
            null,
            [jeremyStart, ...buildTestLocationQueue(jeremyStart, locations)],
            entranceLaunchDelayTicks('jeremy'),
          ),
        },
      };
    });

    setStaffTest((current) => {
      if (!current) {
        return current;
      }

      const movers = Object.fromEntries(
        fixedStaffProfiles.map((profile) => {
          const mover = current.movers[profile.id] ?? createRouteState(navigation, locationById(profile.locationId, locations)?.marker ?? { x: 0, y: 0 }, profile.direction, profile.locationId);

          return [
            profile.id,
            resetRouteToCell(
              mover,
              navigation,
              entryCell,
              'right',
              null,
              [profile.locationId, ...buildTestLocationQueue(profile.locationId, locations)],
              entranceLaunchDelayTicks(profile.id),
            ),
          ] as const;
        }),
      ) as Record<string, RouteState>;

      return {
        ...current,
        testing: true,
        movers,
      };
    });
  }

  function handleRun() {
    setLocalRunState('running');
    setWorld((current) => (current ? { ...current, testing: false } : current));
    setStaffTest((current) => (current ? { ...current, testing: false } : current));

    if (apiConnected) {
      void (async () => {
        try {
          await fetch('/api/start', { method: 'POST' });
          const employeesResponse = await fetch('/api/employees');
          if (employeesResponse.ok) {
            setEmployeeSnapshot((await employeesResponse.json()) as ApiEmployeeSnapshot);
          }
        } catch {
          // Ignore bridge failures and keep the local sim running.
        }
      })();
    }
  }

  function handleStop() {
    setLocalRunState('paused');
    setWorld((current) => (current ? { ...current, testing: false } : current));
    setStaffTest((current) => (current ? { ...current, testing: false } : current));

    if (apiConnected) {
      void (async () => {
        try {
          await fetch('/api/stop', { method: 'POST' });
          const employeesResponse = await fetch('/api/employees');
          if (employeesResponse.ok) {
            setEmployeeSnapshot((await employeesResponse.json()) as ApiEmployeeSnapshot);
          }
        } catch {
          // Ignore bridge failures and keep the local stop state.
        }
      })();
    }
  }

  function handleTest() {
    const currentlyTesting = Boolean(world?.testing || staffTest?.testing);

    void (async () => {
      if (currentlyTesting) {
        if (!navigation) {
          return;
        }

        if (apiConnected) {
          try {
            const [resetResponse, statusResponse] = await Promise.all([fetch('/api/reset', { method: 'POST' }), fetch('/api/status')]);

            if (resetResponse.ok) {
              setEmployeeSnapshot((await resetResponse.json()) as ApiEmployeeSnapshot);
            }

            if (statusResponse.ok) {
              setApiSnapshot((await statusResponse.json()) as ApiRunnerSnapshot);
            }
          } catch {
            // Ignore bridge failures and still restore local positions.
          }
        }

        setLocalRunState('paused');
        setSelectedStaffId(null);
        setWorld(createWorldState(navigation, locations));
        setStaffTest(createStaffTestState(navigation, locations));
        return;
      }

      if (apiConnected) {
        try {
          await fetch('/api/stop', { method: 'POST' });
          const [statusResponse, employeesResponse] = await Promise.all([fetch('/api/status'), fetch('/api/employees')]);

          if (statusResponse.ok) {
            setApiSnapshot((await statusResponse.json()) as ApiRunnerSnapshot);
          }

          if (employeesResponse.ok) {
            setEmployeeSnapshot((await employeesResponse.json()) as ApiEmployeeSnapshot);
          }
        } catch {
          // Ignore bridge failures; test mode is local-only and should still run.
        }
      }

      setLocalRunState('running');
      setSelectedStaffId(null);
      setWorld((current) => (current ? { ...current, testing: true } : current));
      setStaffTest((current) => (current ? { ...current, testing: true } : current));
      runTest();
    })();
  }

  function beginSettingsPanelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setPanelDragState({
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  }

  function applyLocationSet(nextLocations: OfficeLocation[]) {
    setLocations(nextLocations);
    setWorld((current) => (current && navigation ? remapWorldToGrid(current, navigation, nextLocations) : current));
    setStaffTest((current) => (current && navigation ? remapStaffTestToGrid(current, navigation, nextLocations) : current));
  }

  async function copySelectedGrid() {
    if (!navigation) {
      return;
    }

    const payload: LayoutPayload = {
      version: 2,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      cellSize: navigation.cellSize,
      walkableIndices: serializeWalkableIndices(navigation),
      locations: cloneLocations(locations),
      entranceIndex,
      exitIndex,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // Ignore clipboard failures.
    }
  }

  function applyNavigationGrid(nextNavigation: NavigationGrid) {
    const normalizedLocations = normalizeOfficeLocations(nextNavigation, locations);
    const fallbackDoors = defaultDoorIndices(nextNavigation);
    const nextEntrance = navigation && entranceIndex !== null ? closestWalkableIndex(nextNavigation, cellCenter(navigation, entranceIndex)) : fallbackDoors.entranceIndex;
    const nextExit = navigation && exitIndex !== null ? closestWalkableIndex(nextNavigation, cellCenter(navigation, exitIndex)) : fallbackDoors.exitIndex;

    setNavigation(nextNavigation);
    setLocations(normalizedLocations);
    setEntranceIndex(nextEntrance);
    setExitIndex(nextExit);
    setWorld((current) => (current ? remapWorldToGrid(current, nextNavigation, normalizedLocations) : createWorldState(nextNavigation, normalizedLocations)));
    setStaffTest((current) =>
      current ? remapStaffTestToGrid(current, nextNavigation, normalizedLocations) : createStaffTestState(nextNavigation, normalizedLocations),
    );
  }

  function updateWalkwayCell(index: number, walkable: boolean) {
    if (!navigation) {
      return;
    }

    const nextNavigation = {
      ...navigation,
      walkable: new Uint8Array(navigation.walkable),
    };
    nextNavigation.walkable[index] = walkable ? 1 : 0;

    if (serializeWalkableIndices(nextNavigation).length === 0) {
      return;
    }

    applyNavigationGrid(nextNavigation);
  }

  function placeSelectedLocation(index: number) {
    if (!navigation || !selectedLocationId || navigation.walkable[index] !== 1) {
      return;
    }

    const point = cellCenter(navigation, index);
    applyLocationSet(
      locations.map((location) =>
        location.id === selectedLocationId
          ? {
              ...location,
              marker: point,
              targets: {
                sam: point,
                jeremy: point,
              },
            }
          : location,
      ),
    );
  }

  function placeDoor(index: number, type: 'entrance' | 'exit') {
    if (!navigation || navigation.walkable[index] !== 1) {
      return;
    }

    if (type === 'entrance') {
      setEntranceIndex(index);
      return;
    }

    setExitIndex(index);
  }

  function createLocation() {
    if (!navigation) {
      return;
    }

    const label = newLocationLabel.trim();
    const id = (newLocationId.trim() || slugifyLocationId(label)).trim();
    if (!label || !id || locations.some((location) => location.id === id)) {
      return;
    }

    const fallbackDoors = defaultDoorIndices(navigation);
    const placementIndex =
      selectedCellIndex !== null && navigation.walkable[selectedCellIndex] === 1
        ? selectedCellIndex
        : entranceIndex ?? fallbackDoors.entranceIndex;
    const point = cellCenter(navigation, placementIndex);

    applyLocationSet([
      ...locations,
      {
        id,
        label,
        marker: point,
        targets: {
          sam: point,
          jeremy: point,
        },
      },
    ]);
    setSelectedLocationId(id);
    setConsoleTool('place-location');
    setNewLocationLabel('');
    setNewLocationId('');
  }

  function handleResetLayout() {
    if (!navigation) {
      return;
    }

    const defaults = createDefaultLayout();
    setNavigation(defaults.navigation);
    setLocations(defaults.locations);
    setSelectedLocationId(defaults.locations[0]?.id ?? null);
    setEntranceIndex(defaults.entranceIndex);
    setExitIndex(defaults.exitIndex);
    setSelectedCellIndex(null);
    setWorld(createWorldState(defaults.navigation, defaults.locations));
    setStaffTest(createStaffTestState(defaults.navigation, defaults.locations));
  }

  function handleClearEverything() {
    const emptyNavigation = createEmptyNavigationGrid();
    setNavigation(emptyNavigation);
    setLocations([]);
    setSelectedLocationId(null);
    setEntranceIndex(null);
    setExitIndex(null);
    setSelectedCellIndex(null);
    setNewLocationLabel('');
    setNewLocationId('');
    setWorld(createWorldState(emptyNavigation, []));
    setStaffTest(createStaffTestState(emptyNavigation, []));
  }

  function gridIndexFromClientPosition(clientX: number, clientY: number) {
    if (!navigation || !gridOverlayRef.current) {
      return null;
    }

    const rect = gridOverlayRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const relativeX = ((clientX - rect.left) / rect.width) * MAP_WIDTH;
    const relativeY = ((clientY - rect.top) / rect.height) * MAP_HEIGHT;

    if (relativeX < 0 || relativeY < 0 || relativeX > MAP_WIDTH || relativeY > MAP_HEIGHT) {
      return null;
    }

    return gridIndexForPoint(navigation, { x: relativeX, y: relativeY });
  }

  function paintGridFromPointer(clientX: number, clientY: number) {
    if (!settingsOpen || !gridSelectionMode) {
      return;
    }

    const index = gridIndexFromClientPosition(clientX, clientY);
    if (index === null) {
      return;
    }

    setSelectedCellIndex(index);
    updateWalkwayCell(index, gridSelectionMode === 'add');
  }

  function handleGridCellPointerDown(index: number) {
    if (!navigation) {
      return;
    }

    setSelectedCellIndex(index);

    if (consoleTool === 'add-walkway' || consoleTool === 'remove-walkway') {
      const paintMode = consoleTool === 'add-walkway' ? 'add' : 'remove';
      setGridSelectionMode(paintMode);
      updateWalkwayCell(index, paintMode === 'add');
      return;
    }

    if (consoleTool === 'place-location') {
      placeSelectedLocation(index);
      return;
    }

    if (consoleTool === 'place-entrance') {
      placeDoor(index, 'entrance');
      return;
    }

    if (consoleTool === 'place-exit') {
      placeDoor(index, 'exit');
    }
  }

  function handleGridCellPointerEnter(index: number) {
    if (!settingsOpen || !gridSelectionMode) {
      return;
    }

    updateWalkwayCell(index, gridSelectionMode === 'add');
  }

  function handleGridOverlayPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.buttons & 1) === 0) {
      return;
    }

    paintGridFromPointer(event.clientX, event.clientY);
  }

  if (!navigation || !world || !staffTest) {
    return (
      <main className="sim-shell loading-shell">
        <section className="loading-panel">
          <p>Loading office simulation.</p>
        </section>
      </main>
    );
  }

  const isTesting = world.testing || staffTest.testing;
  const runnerStatus = apiSnapshot?.status.state ?? localRunState;
  const apiLiveConfigured = Boolean(apiConnected && apiMeta?.live);
  const isLiveSpending = apiLiveConfigured && runnerStatus === 'running' && !isTesting;
  const dashboardRequests = employeeSnapshot ? employeeSnapshot.usage.requestCount.toLocaleString() : apiConnected && apiLiveConfigured ? '--' : '0';
  const dashboardTokens = employeeSnapshot ? employeeSnapshot.usage.totalTokens.toLocaleString() : apiConnected && apiLiveConfigured ? '--' : '0';
  const dashboardCost = employeeSnapshot ? `$${employeeSnapshot.usage.estimatedCostUsd.toFixed(2)}` : apiConnected && apiLiveConfigured ? '--' : '$0.00';
  const modelBreakdown = employeeSnapshot?.usage.byModel ?? [];
  const transportLabel =
    apiMeta?.transport === 'proxy'
      ? `Proxy${apiMeta.model ? ` · ${apiMeta.model}` : ''}${modelBreakdown.length > 1 ? ' + routing' : ''}`
      : apiMeta?.transport === 'direct'
        ? `Direct${apiMeta.model ? ` · ${apiMeta.model}` : ''}${modelBreakdown.length > 1 ? ' + routing' : ''}`
        : 'Local scripted';
  const runtimeUsageLabel = employeeSnapshot
    ? `${employeeSnapshot.usage.requestCount.toLocaleString()} req · ${employeeSnapshot.usage.totalTokens.toLocaleString()} tok · $${employeeSnapshot.usage.estimatedCostUsd.toFixed(4)}`
    : apiConnected && apiLiveConfigured
      ? '-- req · -- tok · --'
      : '0 req · 0 tok · $0.0000';
  const modeLabel = isTesting
    ? 'Local scripted test'
    : isLiveSpending
      ? 'Live tokens in use'
      : apiLiveConfigured
        ? 'Ready for live run'
        : 'Local scripted mode';
  const shouldShowGrid = settingsOpen;
  const selectedWalkableCount = navigation.walkable.reduce((total, cell) => total + (cell === 1 ? 1 : 0), 0);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null;
  const selectedCell = selectedCellIndex !== null ? gridCells[selectedCellIndex] ?? null : null;
  const selectedColumn = selectedCell ? gridColumns[selectedCell.col] ?? null : null;
  const entranceCell = entranceIndex !== null ? gridCells[entranceIndex] ?? null : null;
  const exitCell = exitIndex !== null ? gridCells[exitIndex] ?? null : null;
  const crowdOffsetsByEntity = new Map<string, { x: number; y: number }>();
  const occupantsByCell = new Map<number, string[]>();

  for (const actorId of actorIds) {
    const actor = world.actors[actorId];
    if (actor.nextCell !== null) {
      continue;
    }

    const occupants = occupantsByCell.get(actor.cell) ?? [];
    occupants.push(actorId);
    occupantsByCell.set(actor.cell, occupants);
  }

  for (const profile of fixedStaffProfiles) {
    const mover = staffTest.movers[profile.id];
    if (!mover || mover.nextCell !== null) {
      continue;
    }

    const occupants = occupantsByCell.get(mover.cell) ?? [];
    occupants.push(profile.id);
    occupantsByCell.set(mover.cell, occupants);
  }

  for (const occupants of occupantsByCell.values()) {
    occupants.forEach((id, index) => {
      crowdOffsetsByEntity.set(id, crowdOffset(index, occupants.length));
    });
  }

  const staffDossiers = [
    {
      id: 'sam-dossier',
      name: 'Sam',
      strip: actorProfiles.sam.strip,
      position: employeeById(employeeSnapshot, 'sam')?.position ?? actorProfiles.sam.thought.title,
      status: employeeById(employeeSnapshot, 'sam')?.status ?? actorStatusText(world.actors.sam, locations),
      bio: employeeById(employeeSnapshot, 'sam')?.bio ?? 'Steady and patient, Sam keeps the front-end work calm and organized.',
      objective:
        employeeById(employeeSnapshot, 'sam')?.objective ?? 'Keep the React lane moving without dropping review discipline.',
      currentAction: employeeById(employeeSnapshot, 'sam')?.currentAction ?? null,
      location:
        locationById(employeeById(employeeSnapshot, 'sam')?.currentLocationId ?? world.actors.sam.currentLocationId ?? actorProfiles.sam.startLocationId, locations)?.label ??
        'Unknown',
      checklist: employeeById(employeeSnapshot, 'sam')?.checklist ?? actorProfiles.sam.thought.checklist,
      activeMemory: employeeById(employeeSnapshot, 'sam')?.activeMemory ?? [],
      passiveMemoryCount: employeeById(employeeSnapshot, 'sam')?.passiveMemoryCount ?? 0,
      privateNoteCount: employeeById(employeeSnapshot, 'sam')?.privateNoteCount ?? 0,
      currentEmailSubject: employeeById(employeeSnapshot, 'sam')?.currentEmailSubject ?? null,
      inboundRequests: employeeById(employeeSnapshot, 'sam')?.inboundRequests ?? [],
      outboundRequests: employeeById(employeeSnapshot, 'sam')?.outboundRequests ?? [],
      performance: employeeById(employeeSnapshot, 'sam')?.performance ?? null,
    },
    {
      id: 'jeremy-dossier',
      name: 'Jeremy',
      strip: actorProfiles.jeremy.strip,
      position: employeeById(employeeSnapshot, 'jeremy')?.position ?? actorProfiles.jeremy.thought.title,
      status: employeeById(employeeSnapshot, 'jeremy')?.status ?? actorStatusText(world.actors.jeremy, locations),
      bio: employeeById(employeeSnapshot, 'jeremy')?.bio ?? 'Direct and reliable, Jeremy likes quick fixes that remove blockers fast.',
      objective:
        employeeById(employeeSnapshot, 'jeremy')?.objective ?? 'Keep the React lane moving without dropping review discipline.',
      currentAction: employeeById(employeeSnapshot, 'jeremy')?.currentAction ?? null,
      location:
        locationById(employeeById(employeeSnapshot, 'jeremy')?.currentLocationId ?? world.actors.jeremy.currentLocationId ?? actorProfiles.jeremy.startLocationId, locations)?.label ??
        'Unknown',
      checklist: employeeById(employeeSnapshot, 'jeremy')?.checklist ?? actorProfiles.jeremy.thought.checklist,
      activeMemory: employeeById(employeeSnapshot, 'jeremy')?.activeMemory ?? [],
      passiveMemoryCount: employeeById(employeeSnapshot, 'jeremy')?.passiveMemoryCount ?? 0,
      privateNoteCount: employeeById(employeeSnapshot, 'jeremy')?.privateNoteCount ?? 0,
      currentEmailSubject: employeeById(employeeSnapshot, 'jeremy')?.currentEmailSubject ?? null,
      inboundRequests: employeeById(employeeSnapshot, 'jeremy')?.inboundRequests ?? [],
      outboundRequests: employeeById(employeeSnapshot, 'jeremy')?.outboundRequests ?? [],
      performance: employeeById(employeeSnapshot, 'jeremy')?.performance ?? null,
    },
    ...fixedStaffProfiles.map((staff) => {
      const mover = staffTest.movers[staff.id];
      const backendEmployee = employeeById(employeeSnapshot, staff.id);
      return {
        id: staff.id,
        name: backendEmployee?.name ?? staff.name,
        strip: staff.strip,
        position: backendEmployee?.position ?? staff.position,
        status: backendEmployee?.status ?? staffStatusText(mover, staff, locations),
        bio: backendEmployee?.bio ?? staff.bio,
        objective: backendEmployee?.objective ?? `${staff.position} is keeping their lane moving inside office policy.`,
        currentAction: backendEmployee?.currentAction ?? null,
        location: locationById(backendEmployee?.currentLocationId ?? mover?.currentLocationId ?? staff.locationId, locations)?.label ?? staff.position,
        checklist:
          backendEmployee?.checklist ?? [
            staffStatusText(mover, staff, locations),
            `Assigned to ${staff.position}`,
            `Stationed at ${locationById(staff.locationId, locations)?.label ?? staff.position}`,
          ],
        activeMemory: backendEmployee?.activeMemory ?? [],
        passiveMemoryCount: backendEmployee?.passiveMemoryCount ?? 0,
        privateNoteCount: backendEmployee?.privateNoteCount ?? 0,
        currentEmailSubject: backendEmployee?.currentEmailSubject ?? null,
        inboundRequests: backendEmployee?.inboundRequests ?? [],
        outboundRequests: backendEmployee?.outboundRequests ?? [],
        performance: backendEmployee?.performance ?? null,
      };
    }),
  ];

  return (
    <main className="sim-shell">
      <div className="nav-bar">
        <button className="nav-button" onClick={() => setView((current) => (current === 'office' ? 'dashboard' : 'office'))} type="button">
          {view === 'office' ? 'Dashboard' : 'Office'}
        </button>
        <button className={`nav-button ${settingsOpen ? 'is-active' : ''}`} onClick={() => setSettingsOpen((current) => !current)} type="button">
          Grid Console
        </button>
      </div>

      <div className="runtime-bar">
        <button
          className={`runtime-button ${runnerStatus === 'running' && !isTesting ? 'is-accent' : ''}`}
          onClick={runnerStatus === 'running' && !isTesting ? handleStop : handleRun}
          type="button"
        >
          {runnerStatus === 'running' && !isTesting ? 'Stop' : 'Run'}
        </button>
        <button className={`runtime-button ${isTesting ? 'is-accent' : ''}`} onClick={handleTest} type="button">
          Test
        </button>
        {isLiveSpending ? (
          <button className="runtime-button live-button is-live" disabled type="button">
            Live
          </button>
        ) : null}
        <div aria-live="polite" className="runtime-usage">
          {runtimeUsageLabel}
        </div>
      </div>

      {settingsOpen ? (
        <aside className="settings-panel" style={{ left: settingsPanelPosition.x, top: settingsPanelPosition.y }}>
          <div className="settings-header">
            <div className={`settings-drag-handle ${panelDragState ? 'is-dragging' : ''}`} onPointerDown={beginSettingsPanelDrag} role="presentation">
              <p className="editor-eyebrow">Grid Console</p>
              <span>Move</span>
            </div>
            <div className="settings-header-actions">
              <button className="settings-close" onClick={() => setSettingsOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="settings-tabs">
            <button className={`settings-tab ${consoleSection === 'walkways' ? 'is-active' : ''}`} onClick={() => setConsoleSection('walkways')} type="button">
              Walkways
            </button>
            <button className={`settings-tab ${consoleSection === 'locations' ? 'is-active' : ''}`} onClick={() => setConsoleSection('locations')} type="button">
              Locations
            </button>
            <button className={`settings-tab ${consoleSection === 'doors' ? 'is-active' : ''}`} onClick={() => setConsoleSection('doors')} type="button">
              Entrance / Exit
            </button>
          </div>

          <div className="settings-section">
            <p className="settings-copy">
              The overlay now matches the image bounds exactly. Pick a tool, then click the map to paint walkways, place locations, or set the entrance and exit cells.
            </p>
            <div className="settings-metrics">
              <span>{navigation.cols} columns</span>
              <span>{navigation.rows} rows</span>
              <span>{selectedWalkableCount} walkable cells</span>
              <span>{locations.length} locations</span>
            </div>

            {selectedCell ? (
              <div className="settings-readout">
                <p className="settings-readout-title">Selected Cell</p>
                <p>
                  Cell {selectedCell.index} · col {selectedCell.col} · row {selectedCell.row}
                </p>
                {selectedColumn ? (
                  <p>
                    Column x: {Math.round(selectedColumn.startX)}-{Math.round(selectedColumn.endX)} · center {Math.round(selectedColumn.centerX)}
                  </p>
                ) : null}
                <p>
                  World: {Math.round(selectedCell.centerX)}, {Math.round(selectedCell.centerY)}
                </p>
                <p>{navigation.walkable[selectedCell.index] === 1 ? 'Walkable' : 'Blocked'}</p>
              </div>
            ) : null}

            {consoleSection === 'walkways' ? (
              <>
                <div className="settings-actions">
                  <button
                    className={`settings-action ${consoleTool === 'add-walkway' ? 'is-primary' : ''}`}
                    onClick={() => setConsoleTool((current) => (current === 'add-walkway' ? null : 'add-walkway'))}
                    type="button"
                  >
                    Paint Walkway
                  </button>
                  <button
                    className={`settings-action ${consoleTool === 'remove-walkway' ? 'is-primary' : ''}`}
                    onClick={() => setConsoleTool((current) => (current === 'remove-walkway' ? null : 'remove-walkway'))}
                    type="button"
                  >
                    Erase Walkway
                  </button>
                  <button className="settings-action" onClick={() => void copySelectedGrid()} type="button">
                    Copy Layout JSON
                  </button>
                  <button className="settings-action" onClick={handleClearEverything} type="button">
                    Clear Everything
                  </button>
                  <button className="settings-action" onClick={handleResetLayout} type="button">
                    Reset Defaults
                  </button>
                </div>
                <p className="settings-copy">Click and hold to draw continuous walkway lines. The pathfinder uses only the green cells.</p>
              </>
            ) : null}

            {consoleSection === 'locations' ? (
              <>
                <div className="settings-actions">
                  <button
                    className={`settings-action ${consoleTool === 'place-location' ? 'is-primary' : ''}`}
                    onClick={() => setConsoleTool((current) => (current === 'place-location' ? null : 'place-location'))}
                    type="button"
                  >
                    Place Selected
                  </button>
                </div>
                <div className="settings-form">
                  <label className="settings-field">
                    <span>New location label</span>
                    <input onChange={(event) => setNewLocationLabel(event.target.value)} type="text" value={newLocationLabel} />
                  </label>
                  <label className="settings-field">
                    <span>Location id</span>
                    <input onChange={(event) => setNewLocationId(event.target.value)} placeholder="auto from label" type="text" value={newLocationId} />
                  </label>
                  <button className="settings-action is-primary" onClick={createLocation} type="button">
                    Create Location
                  </button>
                </div>
                <div className="settings-location-list">
                  {locations.map((location) => (
                    <button
                      className={`settings-location-button ${location.id === selectedLocationId ? 'is-active' : ''}`}
                      key={location.id}
                      onClick={() => setSelectedLocationId(location.id)}
                      type="button"
                    >
                      <span>{location.label}</span>
                      <span>{location.id}</span>
                    </button>
                  ))}
                </div>
                {selectedLocation ? <p className="settings-copy">Selected location: {selectedLocation.label}. Choose "Place Selected" and click a walkable cell.</p> : null}
              </>
            ) : null}

            {consoleSection === 'doors' ? (
              <>
                <div className="settings-actions">
                  <button
                    className={`settings-action ${consoleTool === 'place-entrance' ? 'is-primary' : ''}`}
                    onClick={() => setConsoleTool((current) => (current === 'place-entrance' ? null : 'place-entrance'))}
                    type="button"
                  >
                    Place Entrance
                  </button>
                  <button
                    className={`settings-action ${consoleTool === 'place-exit' ? 'is-primary' : ''}`}
                    onClick={() => setConsoleTool((current) => (current === 'place-exit' ? null : 'place-exit'))}
                    type="button"
                  >
                    Place Exit
                  </button>
                </div>
                <div className="settings-readout">
                  <p className="settings-readout-title">Door Cells</p>
                  <p>Entrance: {entranceCell ? `cell ${entranceCell.index} · ${Math.round(entranceCell.centerX)}, ${Math.round(entranceCell.centerY)}` : 'unset'}</p>
                  <p>Exit: {exitCell ? `cell ${exitCell.index} · ${Math.round(exitCell.centerX)}, ${Math.round(exitCell.centerY)}` : 'unset'}</p>
                </div>
                <p className="settings-copy">Test mode now starts everyone from the entrance cell, then routes them to their assigned desks before random motion begins.</p>
              </>
            ) : null}
          </div>
        </aside>
      ) : null}

      {view === 'dashboard' ? (
        <section className="dashboard-screen">
          <header className="dashboard-header">
            <div>
              <p className="editor-eyebrow">Dashboard</p>
              <h1 className="dashboard-title">Office Dossier</h1>
              <p className="dashboard-copy">Live status for every staffed role, with current assignment and activity text.</p>
            </div>
            <div className="dashboard-metrics">
              <div className="metric-card">
                <span className="metric-label">Mode</span>
                <strong>{modeLabel}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Requests</span>
                <strong>{dashboardRequests}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Tokens Used</span>
                <strong>{dashboardTokens}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Estimated Cost</span>
                <strong>{dashboardCost}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Transport</span>
                <strong>{transportLabel}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Runner</span>
                <strong>{runnerStatus}</strong>
              </div>
            </div>
          </header>

          <div className="dashboard-scroll">
            <div className="dashboard-panels">
              <article className="dashboard-sidecard">
                <p className="sidecard-label">Red Terminal</p>
                <strong className="sidecard-value">
                  {employeeSnapshot?.terminal?.openCount ?? 0} open
                </strong>
                <ul className="sidecard-list">
                  {(employeeSnapshot?.terminal?.items ?? []).slice(0, 4).map((item) => (
                    <li key={item.id}>
                      <span>{item.title}</span>
                      <span>{item.priority}</span>
                    </li>
                  ))}
                  {!employeeSnapshot?.terminal?.items?.length ? <li>No active escalations</li> : null}
                </ul>
              </article>

              <article className="dashboard-sidecard">
                <p className="sidecard-label">Office State</p>
                <strong className="sidecard-value">
                  {employeeSnapshot?.summary?.pendingRequests ?? 0} pending requests
                </strong>
                <ul className="sidecard-list">
                  <li>Working: {employeeSnapshot?.summary?.employeesWorking ?? 0}</li>
                  <li>Waiting: {employeeSnapshot?.summary?.employeesWaiting ?? 0}</li>
                  <li>Open terminal: {employeeSnapshot?.summary?.openTerminal ?? 0}</li>
                  <li>Total requests: {employeeSnapshot?.requests?.length ?? 0}</li>
                </ul>
              </article>

              <article className="dashboard-sidecard">
                <p className="sidecard-label">Playbook</p>
                <strong className="sidecard-value">{employeeSnapshot?.playbook?.length ?? 0} rules</strong>
                <ul className="sidecard-list">
                  {(employeeSnapshot?.playbook ?? []).map((rule) => (
                    <li key={rule.id}>{rule.title}</li>
                  ))}
                </ul>
              </article>

              <article className="dashboard-sidecard">
                <p className="sidecard-label">Archives</p>
                <strong className="sidecard-value">{employeeSnapshot?.knowledgeBase?.length ?? 0} shared notes</strong>
                <ul className="sidecard-list">
                  {(employeeSnapshot?.knowledgeBase ?? []).map((note) => (
                    <li key={note.id}>
                      <span>{note.title}</span>
                      <span>{note.summary}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="dashboard-sidecard">
                <p className="sidecard-label">Email Simulator</p>
                <strong className="sidecard-value">{employeeSnapshot?.emailSimulator?.inboxCount ?? 0} inbox</strong>
                <ul className="sidecard-list">
                  <li>Sent: {employeeSnapshot?.emailSimulator?.sentCount ?? 0}</li>
                  {(employeeSnapshot?.emailSimulator?.pendingSubjects ?? []).map((subject) => (
                    <li key={subject}>{subject}</li>
                  ))}
                  {!employeeSnapshot?.emailSimulator?.pendingSubjects?.length ? <li>No pending email subjects</li> : null}
                </ul>
              </article>

              <article className="dashboard-sidecard">
                <p className="sidecard-label">Missing Staff</p>
                <strong className="sidecard-value">Status unknown</strong>
                <ul className="sidecard-list">
                  {unavailableRoster.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </article>
            </div>

            {staffDossiers.map((entry) => (
              <article className="dossier-card" key={entry.id}>
                <div className="dossier-head">
                  <div className="dossier-identity">
                    <div className="dossier-avatar">
                      <div className="pixel-sprite dossier-avatar-sprite" style={getSpriteStyle(entry.strip, idleFrame('down'))} />
                    </div>
                    <div>
                      <h2 className="dossier-name">{entry.name}</h2>
                      <p className="dossier-position">{entry.position}</p>
                    </div>
                  </div>
                  <span className="dossier-status">{entry.status}</span>
                </div>
                <p className="dossier-location">Current location: {entry.location}</p>
                <p className="dossier-objective">{entry.objective}</p>
                {entry.currentAction ? <p className="dossier-current-action">Current action: {entry.currentAction}</p> : null}
                <p className="dossier-bio">{entry.bio}</p>
                <div className="dossier-meta-row">
                  <span>Inbound: {entry.inboundRequests.length}</span>
                  <span>Outbound: {entry.outboundRequests.length}</span>
                  <span>Passive memory: {entry.passiveMemoryCount}</span>
                  <span>Memory notes: {entry.privateNoteCount ?? 0}</span>
                </div>
                {entry.currentEmailSubject ? <p className="dossier-current-action">Email: {entry.currentEmailSubject}</p> : null}
                <ul className="dossier-list">
                  {entry.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {entry.inboundRequests.length > 0 || entry.outboundRequests.length > 0 ? (
                  <div className="dossier-request-groups">
                    {entry.inboundRequests.length > 0 ? (
                      <div className="request-group">
                        <p className="request-group-label">Inbound Requests</p>
                        <ul className="request-list">
                          {entry.inboundRequests.map((request) => (
                            <li key={request.id}>
                              <span>{request.title}</span>
                              <span>
                                {requestStatusLabel(request.status)} · {request.counterpartName}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {entry.outboundRequests.length > 0 ? (
                      <div className="request-group">
                        <p className="request-group-label">Outbound Requests</p>
                        <ul className="request-list">
                          {entry.outboundRequests.map((request) => (
                            <li key={request.id}>
                              <span>{request.title}</span>
                              <span>
                                {requestStatusLabel(request.status)} · {request.counterpartName}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {entry.activeMemory.length > 0 ? (
                  <div className="memory-group">
                    <p className="request-group-label">Active Memory</p>
                    <ul className="memory-list">
                      {entry.activeMemory.slice(-3).map((memory) => (
                        <li key={memory.id}>{memory.summary}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {entry.performance ? (
                  <p className="dossier-performance">
                    Quality {entry.performance.qualityScore.toFixed(2)} · Plans {entry.performance.completedPlans} · Corrections {entry.performance.corrections} · Escalations{' '}
                    {entry.performance.escalations}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`office-stage ${view === 'dashboard' ? 'is-hidden' : 'is-fullscreen'}`}>
        <div className="office-frame">
          <img alt="Office map" className="office-map" draggable={false} src={officeMap} />

          {shouldShowGrid ? (
            <div className="grid-overlay" onPointerMove={handleGridOverlayPointerMove} ref={gridOverlayRef}>
              {gridCells.map((cell) => {
                const isWalkable = navigation.walkable[cell.index] === 1;
                const isSelected = selectedCellIndex === cell.index;
                const isLocationCell = selectedLocation ? exactCellIndexForPoint(navigation, selectedLocation.marker) === cell.index : false;
                const isEntranceCell = entranceIndex === cell.index;
                const isExitCell = exitIndex === cell.index;

                return (
                  <button
                    className={`grid-cell ${isWalkable ? 'is-walkable' : 'is-blocked'} ${isSelected ? 'is-selected' : ''} ${isLocationCell ? 'is-location-target' : ''} ${isEntranceCell ? 'is-entrance' : ''} ${isExitCell ? 'is-exit' : ''}`}
                    key={cell.index}
                    onPointerDown={() => handleGridCellPointerDown(cell.index)}
                    onPointerEnter={() => handleGridCellPointerEnter(cell.index)}
                    style={cell.style}
                    type="button"
                  />
                );
              })}
            </div>
          ) : null}

          {shouldShowGrid ? (
            <div className="location-reveal-layer">
              {locations.map((location) => {
                const cellIndex = exactCellIndexForPoint(navigation, location.marker);
                const cell = gridCells[cellIndex];
                if (!cell) {
                  return null;
                }

                return (
                  <div
                    className={`location-reveal-chip ${location.id === selectedLocationId ? 'is-active' : ''}`}
                    key={location.id}
                    style={actorStyle(cell.centerX, cell.centerY, 1)}
                  >
                    {location.label}
                  </div>
                );
              })}
              {entranceCell ? (
                <div className="location-reveal-chip is-door is-entrance" style={actorStyle(entranceCell.centerX, entranceCell.centerY, 1)}>
                  Entrance
                </div>
              ) : null}
              {exitCell ? (
                <div className="location-reveal-chip is-door is-exit" style={actorStyle(exitCell.centerX, exitCell.centerY, 1)}>
                  Exit
                </div>
              ) : null}
            </div>
          ) : null}

          {fixedStaffProfiles.map((staff) => {
          const location = locationById(staff.locationId, locations);
          if (!location) {
            return null;
          }

          const backendEmployee = employeeById(employeeSnapshot, staff.id);
          const mover = staffTest.movers[staff.id];
          const offset = crowdOffsetsByEntity.get(staff.id) ?? { x: 0, y: 0 };
          const x = (mover?.x ?? location.marker.x) + offset.x;
          const y = (mover?.y ?? location.marker.y) + offset.y;
          const frameIndex = mover?.frameIndex ?? fixedStaffFrame(staff.direction, world.tick, staff.animationOffset);
          const placement = thoughtPlacement(x);
          const isExpanded = selectedStaffId === staff.id;

          return (
            <div
              className="office-actor"
              key={staff.id}
              style={{ ...actorStyle(x, y), opacity: shouldShowGrid ? 0.38 : 1, pointerEvents: shouldShowGrid ? 'none' : 'auto' }}
            >
              {!shouldShowGrid && isExpanded ? (
                <div className={`thought-anchor is-${placement}`}>
                  <section className="thought-panel staff-card">
                    <p className="thought-panel-title">{backendEmployee?.name ?? staff.name}</p>
                    <p className="staff-role">{backendEmployee?.position ?? staff.position}</p>
                    <p className="staff-bio">{backendEmployee?.bio ?? staff.bio}</p>
                  </section>
                </div>
              ) : null}
              <button
                aria-label={`${backendEmployee?.name ?? staff.name}, ${backendEmployee?.position ?? staff.position}`}
                className={`actor-sprite-button ${isExpanded ? 'is-active' : ''}`}
                onClick={() => setSelectedStaffId((current) => (current === staff.id ? null : staff.id))}
                type="button"
              >
                <div className="pixel-sprite office-sprite" style={getSpriteStyle(staff.strip, frameIndex)} />
              </button>
            </div>
          );
          })}

          {actorIds.map((actorId) => {
            const actor = world.actors[actorId];
            const profile = actorProfiles[actorId];
            const offset = crowdOffsetsByEntity.get(actorId) ?? { x: 0, y: 0 };

            return (
              <div
                className="office-actor"
                key={actorId}
                style={{
                  ...actorStyle(actor.x + offset.x, actor.y + offset.y, SPRITE_SIZE),
                  opacity: shouldShowGrid ? 0.38 : 1,
                  pointerEvents: shouldShowGrid ? 'none' : 'auto',
                }}
              >
                <div className="pixel-sprite office-sprite" style={getSpriteStyle(profile.strip, actor.frameIndex)} />
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
