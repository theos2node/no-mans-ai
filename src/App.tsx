import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

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
import defaultGridSelection from './default-grid-selection.json';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_TICKS,
  buildNavigationGrid,
  cellCenter,
  closestWalkableIndex,
  directionBetween,
  findPath,
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
type SettingsSection = 'grid' | 'locations';
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
  currentLocationId: string | null;
  path: number[];
  scriptQueue: string[];
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
}

interface ApiUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

interface ApiEmployeeState {
  id: string;
  name: string;
  position: string;
  assignedLocationId: string;
  currentLocationId: string;
  targetLocationId: string | null;
  phase: string;
  bio: string;
  status: string;
  taskTitle: string;
  checklist: string[];
  scriptQueue: string[];
  planVersion: number;
  lastUpdatedAt: string;
}

interface ApiEmployeeSnapshot {
  mode: 'live' | 'local';
  employees: ApiEmployeeState[];
  usage: ApiUsageSnapshot;
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

interface GridSelectionPayload {
  version: number;
  mapWidth: number;
  mapHeight: number;
  cellSize: number;
  selectedCells: Array<{
    index: number;
    col: number;
    row: number;
    walkable: boolean;
  }>;
}

interface PanelPosition {
  x: number;
  y: number;
}

interface PanelDragState {
  offsetX: number;
  offsetY: number;
}

const TICK_MS = 80;
const SPRITE_SIZE = 96;
const TEST_SCRIPT_LENGTH = 8;
const PATH_STORAGE_KEY = 'office-path-grid-v4';
const LOCATION_STORAGE_KEY = 'office-location-grid-v3';
const GRID_SELECTION_STORAGE_KEY = 'office-grid-selection-v1';
const DEFAULT_SETTINGS_PANEL_POSITION: PanelPosition = { x: 20, y: 76 };

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

const fixedStaffProfiles: StaffProfile[] = [
  {
    id: 'ava-react-a',
    name: 'Ava Kim',
    position: 'React A',
    locationId: 'react-a',
    strip: avaReactAWalkStrip,
    bio: 'A quiet prototyper who likes clean interactions and stable systems.',
    direction: 'right',
    animationOffset: 1,
  },
  {
    id: 'milo-react-b',
    name: 'Milo Perez',
    position: 'React B',
    locationId: 'react-b',
    strip: miloReactBWalkStrip,
    bio: 'Fast-moving and energetic, usually the first one to volunteer for UI polish.',
    direction: 'left',
    animationOffset: 4,
  },
  {
    id: 'nia-customer-service',
    name: 'Nia Solis',
    position: 'Customer Service',
    locationId: 'customer-service',
    strip: niaServiceWalkStrip,
    bio: 'Warm, observant, and hard to rattle, with a strong memory for people.',
    direction: 'left',
    animationOffset: 13,
  },
  {
    id: 'ellis-accounting',
    name: 'Ellis Hart',
    position: 'Accounting',
    locationId: 'accounting',
    strip: ellisAccountingWalkStrip,
    bio: 'Methodical and dry-humored, Ellis notices bad numbers immediately.',
    direction: 'down',
    animationOffset: 16,
  },
  {
    id: 'rowan-manager',
    name: 'Rowan Pike',
    position: 'General Manager',
    locationId: 'general-manager',
    strip: rowanManagerWalkStrip,
    bio: 'Decisive and composed, Rowan keeps the office moving without over-talking.',
    direction: 'down',
    animationOffset: 19,
  },
  {
    id: 'petra-quality',
    name: 'Petra Vale',
    position: 'Quality Inspector',
    locationId: 'quality-inspector',
    strip: petraQualityWalkStrip,
    bio: 'Exacting and sharp-eyed, Petra spots tiny breakages before anyone else.',
    direction: 'right',
    animationOffset: 22,
  },
  {
    id: 'june-terminal',
    name: 'June Mercer',
    position: 'IT Support',
    locationId: 'it-support',
    strip: juneLiaisonWalkStrip,
    bio: 'Quick on diagnostics and calm under pressure, June handles office support without drama.',
    direction: 'left',
    animationOffset: 25,
  },
];

function employeeById(snapshot: ApiEmployeeSnapshot | null, id: string) {
  return snapshot?.employees.find((employee) => employee.id === id) ?? null;
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
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(point.x / grid.cellSize)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(point.y / grid.cellSize)));
  return row * grid.cols + col;
}

function loadNavigationGrid() {
  const baseGrid = buildNavigationGrid();

  if (typeof window === 'undefined') {
    return baseGrid;
  }

  const saved = window.localStorage.getItem(PATH_STORAGE_KEY);
  if (!saved) {
    return baseGrid;
  }

  try {
    const indices = JSON.parse(saved) as number[];
    const walkable = new Uint8Array(baseGrid.walkable.length);

    for (const index of indices) {
      if (typeof index === 'number' && index >= 0 && index < walkable.length) {
        walkable[index] = 1;
      }
    }

    return {
      ...baseGrid,
      walkable,
    };
  } catch {
    return baseGrid;
  }
}

function loadLocations() {
  const grid = buildNavigationGrid();
  const defaults = cloneLocations(normalizeOfficeLocations(grid, officeLocations));

  if (typeof window === 'undefined') {
    return defaults;
  }

  const saved = window.localStorage.getItem(LOCATION_STORAGE_KEY);
  if (!saved) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(saved) as OfficeLocation[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaults;
    }

    const sanitized = parsed
      .filter(
        (location) =>
          location &&
          typeof location.id === 'string' &&
          typeof location.label === 'string' &&
          !DEPRECATED_LOCATION_IDS.has(location.id),
      )
      .map((location) => ({
        id: location.id,
        label: location.label,
        marker: { x: location.marker.x, y: location.marker.y },
        targets: {
          sam: { x: location.targets.sam.x, y: location.targets.sam.y },
          jeremy: { x: location.targets.jeremy.x, y: location.targets.jeremy.y },
        },
      }));

    const savedById = new Map(sanitized.map((location) => [location.id, location] as const));
    const mergedDefaults = defaults.map((location) => savedById.get(location.id) ?? location);
    const extraSaved = sanitized.filter((location) => !defaults.some((defaultLocation) => defaultLocation.id === location.id));

    return normalizeOfficeLocations(grid, [...mergedDefaults, ...extraSaved]);
  } catch {
    return defaults;
  }
}

function loadGridSelectionIndices() {
  const fallback = (defaultGridSelection as GridSelectionPayload).selectedCells.map((cell) => cell.index);

  if (typeof window === 'undefined') {
    return fallback;
  }

  const saved = window.localStorage.getItem(GRID_SELECTION_STORAGE_KEY);
  if (!saved) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(saved) as number[];
    return Array.isArray(parsed) ? parsed.filter((index) => typeof index === 'number') : fallback;
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
    currentLocationId,
    path: [],
    scriptQueue: [],
    backendPlanVersion: 0,
  };
}

function createWorldState(grid: NavigationGrid, locations: OfficeLocation[]): WorldState {
  const samLocation = locationById(actorProfiles.sam.startLocationId, locations) ?? locations[0];
  const jeremyLocation = locationById(actorProfiles.jeremy.startLocationId, locations) ?? locations[0];

  return {
    tick: 0,
    testing: false,
    actors: {
      sam: createRouteState(grid, samLocation.targets.sam, 'right', samLocation.id),
      jeremy: createRouteState(grid, jeremyLocation.targets.jeremy, 'left', jeremyLocation.id),
    },
  };
}

function createStaffTestState(grid: NavigationGrid, locations: OfficeLocation[]): StaffTestState {
  const movers = Object.fromEntries(
    fixedStaffProfiles.map((profile) => {
      const startLocation = locationById(profile.locationId, locations) ?? locations[0];
      return [profile.id, createRouteState(grid, startLocation.marker, profile.direction, startLocation.id)] as const;
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
      currentLocationId,
      path: [],
      scriptQueue: [],
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
          currentLocationId: existing?.currentLocationId ?? profile.locationId,
          path: [],
          scriptQueue: [],
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
    currentLocationId: destinationId,
    path: [],
    frameIndex: idleFrame(route.direction),
  };
}

function stepMovingRoute<T extends RouteState>(route: T, tick: number, grid: NavigationGrid): T {
  if (route.nextCell === null) {
    const center = cellCenter(grid, route.cell);
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
  if (route.nextCell !== null || route.destinationId !== null || route.scriptQueue.length === 0) {
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
  if (route.nextCell !== null || !route.destinationId) {
    return route;
  }

  if (goalCell === null) {
    return {
      ...route,
      destinationId: null,
      path: [],
      frameIndex: idleFrame(route.direction),
    };
  }

  if (route.cell === goalCell) {
    return finishArrival(route, route.destinationId);
  }

  const path = findPath(grid, route.cell, goalCell, blocked);
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

function buildRandomQueue(currentLocationId: string | null, locations: OfficeLocation[], count = TEST_SCRIPT_LENGTH) {
  const queue: string[] = [];
  let lastLocationId = currentLocationId;

  for (let index = 0; index < count; index += 1) {
    const choices = locations.filter((location) => location.id !== lastLocationId);
    const pool = choices.length > 0 ? choices : locations;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    queue.push(choice.id);
    lastLocationId = choice.id;
  }

  return queue;
}

function stepWorld(current: WorldState, grid: NavigationGrid, locations: OfficeLocation[]): WorldState {
  const actors: Record<ActorId, RouteState> = {
    sam: stepMovingRoute({ ...current.actors.sam, path: [...current.actors.sam.path], scriptQueue: [...current.actors.sam.scriptQueue] }, current.tick, grid),
    jeremy: stepMovingRoute(
      { ...current.actors.jeremy, path: [...current.actors.jeremy.path], scriptQueue: [...current.actors.jeremy.scriptQueue] },
      current.tick,
      grid,
    ),
  };

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
    if (actor.nextCell !== null || !actor.destinationId) {
      continue;
    }

    const goalCell = actorGoalCell(grid, actorId, actor.destinationId, locations);
    const blocked = new Set<number>();
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

  const testing =
    current.testing &&
    !actorIds.every((actorId) => {
      const actor = actors[actorId];
      return actor.nextCell === null && actor.destinationId === null && actor.scriptQueue.length === 0;
    });

  return {
    tick: current.tick + 1,
    testing,
    actors,
  };
}

function stepStaffTest(current: StaffTestState, grid: NavigationGrid, locations: OfficeLocation[]): StaffTestState {
  const movers = Object.fromEntries(
    Object.entries(current.movers).map(([id, mover]) => [
      id,
      stepMovingRoute({ ...mover, path: [...mover.path], scriptQueue: [...mover.scriptQueue] }, current.tick, grid),
    ]),
  ) as Record<string, RouteState>;

  const moverIds = Object.keys(movers);

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
    if (mover.nextCell !== null || !mover.destinationId) {
      continue;
    }

    const goalCell = staffGoalCell(grid, mover.destinationId, locations);
    const blocked = new Set<number>();

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

  const testing =
    current.testing &&
    !moverIds.every((moverId) => {
      const mover = movers[moverId];
      return mover.nextCell === null && mover.destinationId === null && mover.scriptQueue.length === 0;
    });

  return {
    tick: current.tick + 1,
    testing,
    movers,
  };
}

function actorStatusText(actor: RouteState, locations: OfficeLocation[]) {
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

  if (route.nextCell !== null || route.destinationId !== null || route.scriptQueue.length > 0) {
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
    currentLocationId: employee.currentLocationId,
    path: [],
    scriptQueue: [...employee.scriptQueue],
    frameIndex: idleFrame(route.direction),
    backendPlanVersion: employee.planVersion,
  };
}

export default function App() {
  const [view, setView] = useState<AppView>('office');
  const [localRunState, setLocalRunState] = useState<LocalRunState>('running');
  const [navigation, setNavigation] = useState<NavigationGrid | null>(null);
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [staffTest, setStaffTest] = useState<StaffTestState | null>(null);
  const [apiSnapshot, setApiSnapshot] = useState<ApiRunnerSnapshot | null>(null);
  const [employeeSnapshot, setEmployeeSnapshot] = useState<ApiEmployeeSnapshot | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [apiLive, setApiLive] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('grid');
  const [revealLocations, setRevealLocations] = useState(false);
  const [selectedGridCells, setSelectedGridCells] = useState<number[]>([]);
  const [gridSelectionMode, setGridSelectionMode] = useState<'add' | 'remove' | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [gridJsonInput, setGridJsonInput] = useState('');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'applied' | 'failed'>('idle');
  const [locationDraft, setLocationDraft] = useState<OfficeLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationApplyStatus, setLocationApplyStatus] = useState<'idle' | 'applied'>('idle');
  const [settingsPanelPosition, setSettingsPanelPosition] = useState<PanelPosition>(DEFAULT_SETTINGS_PANEL_POSITION);
  const [panelDragState, setPanelDragState] = useState<PanelDragState | null>(null);
  const gridCells = useMemo(() => (navigation ? buildGridCells(navigation) : []), [navigation]);
  const selectedGridCellSet = useMemo(() => new Set(selectedGridCells), [selectedGridCells]);

  useEffect(() => {
    const grid = loadNavigationGrid();
    const loadedLocations = loadLocations();
    setNavigation(grid);
    setLocations(loadedLocations);
    setLocationDraft(cloneLocations(loadedLocations));
    setSelectedLocationId(loadedLocations[0]?.id ?? null);
    setWorld(createWorldState(grid, loadedLocations));
    setStaffTest(createStaffTestState(grid, loadedLocations));
    setSelectedGridCells(loadGridSelectionIndices());
  }, []);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== 'grid') {
      setGridSelectionMode(null);
      return;
    }

    function stopSelection() {
      setGridSelectionMode(null);
    }

    window.addEventListener('pointerup', stopSelection);
    return () => {
      window.removeEventListener('pointerup', stopSelection);
    };
  }, [settingsOpen, settingsSection]);

  useEffect(() => {
    setLocationDraft(cloneLocations(locations));
    setSelectedLocationId((current) => current ?? locations[0]?.id ?? null);
  }, [locations]);

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
    if (!navigation || !world || !staffTest || localRunState !== 'running') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setWorld((current) => (current ? stepWorld(current, navigation, locations) : current));
      setStaffTest((current) => (current ? stepStaffTest(current, navigation, locations) : current));
    }, TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [locations, localRunState, navigation]);

  useEffect(() => {
    let cancelled = false;

    async function fetchApiStatus() {
      try {
        const [statusResponse, metaResponse, employeesResponse] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/meta'),
          fetch('/api/employees'),
        ]);
        if (!statusResponse.ok) {
          throw new Error(`Status failed: ${statusResponse.status}`);
        }

        const snapshot = (await statusResponse.json()) as ApiRunnerSnapshot;
        const meta = metaResponse.ok ? ((await metaResponse.json()) as ApiMeta) : { live: false };
        const employees = employeesResponse.ok ? ((await employeesResponse.json()) as ApiEmployeeSnapshot) : null;

        if (!cancelled) {
          setApiSnapshot(snapshot);
          setEmployeeSnapshot(employees);
          setApiConnected(true);
          setApiLive(Boolean(meta.live));
        }
      } catch {
        if (!cancelled) {
          setApiConnected(false);
          setApiLive(false);
        }
      }
    }

    void fetchApiStatus();
    const intervalId = window.setInterval(() => {
      void fetchApiStatus();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!employeeSnapshot || !navigation || !world || !staffTest) {
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

  useEffect(() => {
    if (!apiConnected || !world || !staffTest) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const payload = {
        employees: buildEmployeeSyncEntries(world, staffTest, locations),
      };

      void fetch('/api/employees/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [apiConnected, employeeSnapshot, locations, staffTest, world]);

  function runTest(scriptQueues?: Record<string, string[]>) {
    if (!navigation || locations.length < 2) {
      return;
    }

    setWorld((current) => {
      if (!current) {
        return current;
      }

      const { samQueue, jeremyQueue } = buildRandomScripts(current, locations);
      const nextSamQueue = scriptQueues?.sam ?? samQueue;
      const nextJeremyQueue = scriptQueues?.jeremy ?? jeremyQueue;

      return {
        ...current,
        testing: true,
        actors: {
          sam: {
            ...current.actors.sam,
            nextCell: null,
            moveProgress: 0,
            x: cellCenter(navigation, current.actors.sam.cell).x,
            y: cellCenter(navigation, current.actors.sam.cell).y,
            destinationId: null,
            path: [],
            scriptQueue: nextSamQueue,
            frameIndex: idleFrame(current.actors.sam.direction),
          },
          jeremy: {
            ...current.actors.jeremy,
            nextCell: null,
            moveProgress: 0,
            x: cellCenter(navigation, current.actors.jeremy.cell).x,
            y: cellCenter(navigation, current.actors.jeremy.cell).y,
            destinationId: null,
            path: [],
            scriptQueue: nextJeremyQueue,
            frameIndex: idleFrame(current.actors.jeremy.direction),
          },
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
          const center = cellCenter(navigation, mover.cell);

          return [
            profile.id,
            {
              ...mover,
              nextCell: null,
              moveProgress: 0,
              x: center.x,
              y: center.y,
              destinationId: null,
              path: [],
              scriptQueue: scriptQueues?.[profile.id] ?? buildRandomQueue(mover.currentLocationId ?? profile.locationId, locations),
              frameIndex: idleFrame(mover.direction),
            },
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

  function handlePause() {
    setLocalRunState('paused');

    if (apiConnected) {
      void (async () => {
        try {
          await fetch('/api/stop', { method: 'POST' });
          const employeesResponse = await fetch('/api/employees');
          if (employeesResponse.ok) {
            setEmployeeSnapshot((await employeesResponse.json()) as ApiEmployeeSnapshot);
          }
        } catch {
          // Ignore bridge failures and keep the local pause state.
        }
      })();
    }
  }

  function handleTest() {
    setLocalRunState('running');
    setSelectedStaffId(null);

    void (async () => {
      try {
        const response = await fetch('/api/test', { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Test failed: ${response.status}`);
        }

        const snapshot = (await response.json()) as ApiEmployeeSnapshot;
        setEmployeeSnapshot(snapshot);
        const queues = Object.fromEntries(snapshot.employees.map((employee) => [employee.id, employee.scriptQueue])) as Record<string, string[]>;
        runTest(queues);
      } catch {
        runTest();
      }
    })();
  }

  function applyLocationDraft(nextLocations: OfficeLocation[]) {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nextLocations));
    setLocations(nextLocations);
    setLocationDraft(cloneLocations(nextLocations));
    setWorld((current) => (current && navigation ? remapWorldToGrid(current, navigation, nextLocations) : current));
    setStaffTest((current) => (current && navigation ? remapStaffTestToGrid(current, navigation, nextLocations) : current));
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

  async function copySelectedGrid() {
    if (!navigation || selectedGridCells.length === 0) {
      return;
    }

    const payload = {
      version: 1,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      cellSize: navigation.cellSize,
      selectedCells: selectedGridCells
        .slice()
        .sort((a, b) => a - b)
        .map((index) => ({
          index,
          col: index % navigation.cols,
          row: Math.floor(index / navigation.cols),
          walkable: navigation.walkable[index] === 1,
        })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  function buildNavigationFromSelectedIndices(selectedIndices: number[]) {
    const baseGrid = buildNavigationGrid();
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

  function serializeWalkableIndices(grid: NavigationGrid) {
    const indices: number[] = [];

    for (let index = 0; index < grid.walkable.length; index += 1) {
      if (grid.walkable[index] === 1) {
        indices.push(index);
      }
    }

    return indices;
  }

  function applyNavigationGrid(nextNavigation: NavigationGrid, selectionIndices: number[]) {
    const normalizedLocations = normalizeOfficeLocations(nextNavigation, locationDraft.length > 0 ? locationDraft : locations);
    window.localStorage.setItem(PATH_STORAGE_KEY, JSON.stringify(serializeWalkableIndices(nextNavigation)));
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(normalizedLocations));
    window.localStorage.setItem(GRID_SELECTION_STORAGE_KEY, JSON.stringify(selectionIndices));
    setNavigation(nextNavigation);
    setLocations(normalizedLocations);
    setLocationDraft(cloneLocations(normalizedLocations));
    setSelectedGridCells(selectionIndices);
    setWorld((current) => (current ? remapWorldToGrid(current, nextNavigation, normalizedLocations) : createWorldState(nextNavigation, normalizedLocations)));
    setStaffTest((current) =>
      current ? remapStaffTestToGrid(current, nextNavigation, normalizedLocations) : createStaffTestState(nextNavigation, normalizedLocations),
    );
  }

  function handleApplySelectedGrid() {
    if (selectedGridCells.length === 0) {
      setApplyStatus('failed');
      return;
    }

    const nextNavigation = buildNavigationFromSelectedIndices(selectedGridCells);
    applyNavigationGrid(nextNavigation, selectedGridCells);
    setApplyStatus('applied');
  }

  function placeSelectedLocation(index: number) {
    const cell = gridCells[index];
    if (!cell || !selectedLocationId) {
      return;
    }

    setLocationApplyStatus('idle');
    setLocationDraft((current) =>
      current.map((location) =>
        location.id === selectedLocationId
          ? {
              ...location,
              marker: { x: cell.centerX, y: cell.centerY },
              targets: {
                sam: { x: cell.centerX, y: cell.centerY },
                jeremy: { x: cell.centerX, y: cell.centerY },
              },
            }
          : location,
      ),
    );
  }

  function handleApplyLocations() {
    if (locationDraft.length === 0) {
      return;
    }

    applyLocationDraft(locationDraft);
    setLocationApplyStatus('applied');
  }

  function handleResetLocations() {
    setLocationDraft(cloneLocations(locations));
    setSelectedLocationId((current) => current ?? locations[0]?.id ?? null);
    setLocationApplyStatus('idle');
  }

  function handleApplyGridJson() {
    if (!navigation) {
      setApplyStatus('failed');
      return;
    }

    try {
      const parsed = JSON.parse(gridJsonInput) as GridSelectionPayload;
      if (
        !parsed ||
        parsed.mapWidth !== MAP_WIDTH ||
        parsed.mapHeight !== MAP_HEIGHT ||
        parsed.cellSize !== navigation.cellSize ||
        !Array.isArray(parsed.selectedCells)
      ) {
        throw new Error('Invalid grid payload');
      }

      const selectedIndices = parsed.selectedCells.filter((cell) => cell.walkable).map((cell) => cell.index);
      const allSelectionIndices = parsed.selectedCells.map((cell) => cell.index);
      const nextNavigation = buildNavigationFromSelectedIndices(selectedIndices);
      applyNavigationGrid(nextNavigation, allSelectionIndices);
      setGridJsonInput('');
      setApplyStatus('applied');
    } catch {
      setApplyStatus('failed');
    }
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
  const runtimeBadgeLabel = apiLive ? 'Live' : 'Not live';
  const runtimeBadgeClass = apiLive ? 'is-live' : 'is-local';
  const dashboardTokens = employeeSnapshot ? employeeSnapshot.usage.totalTokens.toLocaleString() : apiConnected && apiLive ? '--' : '0';
  const dashboardCost = employeeSnapshot ? `$${employeeSnapshot.usage.estimatedCostUsd.toFixed(2)}` : apiConnected && apiLive ? '--' : '$0.00';
  const runnerStatus = apiSnapshot?.status.state ?? localRunState;
  const shouldShowGrid = settingsOpen && settingsSection === 'grid' && view === 'office';
  const shouldShowLocationEditor = settingsOpen && settingsSection === 'locations' && view === 'office';
  const selectedWalkableCount = selectedGridCells.reduce((total, index) => total + (navigation.walkable[index] === 1 ? 1 : 0), 0);
  const visibleLocations = shouldShowLocationEditor ? locationDraft : locations;
  const selectedLocation = locationDraft.find((location) => location.id === selectedLocationId) ?? null;

  function updateGridSelection(index: number, modeOverride?: 'add' | 'remove') {
    setCopyStatus('idle');
    setSelectedGridCells((current) => {
      const isSelected = current.includes(index);
      const mode = modeOverride ?? gridSelectionMode ?? (isSelected ? 'remove' : 'add');

      if (mode === 'add') {
        return isSelected ? current : [...current, index];
      }

      return current.filter((cellIndex) => cellIndex !== index);
    });
  }

  function beginGridSelection(index: number) {
    const nextMode = selectedGridCellSet.has(index) ? 'remove' : 'add';
    setGridSelectionMode(nextMode);
    updateGridSelection(index, nextMode);
  }

  const staffDossiers = [
    {
      id: 'sam-dossier',
      name: 'Sam',
      strip: actorProfiles.sam.strip,
      position: employeeById(employeeSnapshot, 'sam')?.position ?? actorProfiles.sam.thought.title,
      status: employeeById(employeeSnapshot, 'sam')?.status ?? actorStatusText(world.actors.sam, locations),
      bio: employeeById(employeeSnapshot, 'sam')?.bio ?? 'Steady and patient, Sam keeps the front-end work calm and organized.',
      location:
        locationById(employeeById(employeeSnapshot, 'sam')?.currentLocationId ?? world.actors.sam.currentLocationId ?? actorProfiles.sam.startLocationId, locations)?.label ??
        'Unknown',
      checklist: employeeById(employeeSnapshot, 'sam')?.checklist ?? actorProfiles.sam.thought.checklist,
    },
    {
      id: 'jeremy-dossier',
      name: 'Jeremy',
      strip: actorProfiles.jeremy.strip,
      position: employeeById(employeeSnapshot, 'jeremy')?.position ?? actorProfiles.jeremy.thought.title,
      status: employeeById(employeeSnapshot, 'jeremy')?.status ?? actorStatusText(world.actors.jeremy, locations),
      bio: employeeById(employeeSnapshot, 'jeremy')?.bio ?? 'Direct and reliable, Jeremy likes quick fixes that remove blockers fast.',
      location:
        locationById(employeeById(employeeSnapshot, 'jeremy')?.currentLocationId ?? world.actors.jeremy.currentLocationId ?? actorProfiles.jeremy.startLocationId, locations)?.label ??
        'Unknown',
      checklist: employeeById(employeeSnapshot, 'jeremy')?.checklist ?? actorProfiles.jeremy.thought.checklist,
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
        location: locationById(backendEmployee?.currentLocationId ?? mover?.currentLocationId ?? staff.locationId, locations)?.label ?? staff.position,
        checklist:
          backendEmployee?.checklist ?? [
            staffStatusText(mover, staff, locations),
            `Assigned to ${staff.position}`,
            `Stationed at ${locationById(staff.locationId, locations)?.label ?? staff.position}`,
          ],
      };
    }),
  ];

  return (
    <main className="sim-shell">
      <div className="nav-bar">
        <button
          aria-label="Settings"
          className={`nav-button icon-button ${settingsOpen ? 'is-active' : ''}`}
          onClick={() => {
            setSettingsOpen((current) => !current);
            setCopyStatus('idle');
          }}
          type="button"
        >
          ⚙
        </button>
        <button className="nav-button" onClick={() => setView((current) => (current === 'office' ? 'dashboard' : 'office'))} type="button">
          {view === 'office' ? 'Dashboard' : 'Office'}
        </button>
      </div>

      <div className="runtime-bar">
        <button className="runtime-button" onClick={handleRun} type="button">
          Run
        </button>
        <button className="runtime-button" disabled={localRunState !== 'running'} onClick={handlePause} type="button">
          Pause
        </button>
        <button className={`runtime-button ${isTesting ? 'is-accent' : ''}`} onClick={handleTest} type="button">
          Test
        </button>
        <button className={`runtime-button live-button ${runtimeBadgeClass}`} disabled type="button">
          {runtimeBadgeLabel}
        </button>
      </div>

      {settingsOpen ? (
        <aside className="settings-panel" style={{ left: settingsPanelPosition.x, top: settingsPanelPosition.y }}>
          <div className="settings-header">
            <div className={`settings-drag-handle ${panelDragState ? 'is-dragging' : ''}`} onPointerDown={beginSettingsPanelDrag} role="presentation">
              <p className="editor-eyebrow">Settings</p>
              <span>Move</span>
            </div>
            <div className="settings-header-actions">
              <button
                className="settings-close"
                onClick={() => {
                  setSettingsOpen(false);
                  setCopyStatus('idle');
                }}
                type="button"
              >
                Close
              </button>
            </div>
          </div>

          <div className="settings-tabs">
            <button
              className={`settings-tab ${settingsSection === 'grid' ? 'is-active' : ''}`}
              onClick={() => setSettingsSection('grid')}
              type="button"
            >
              Grid
            </button>
            <button
              className={`settings-tab ${settingsSection === 'locations' ? 'is-active' : ''}`}
              onClick={() => setSettingsSection('locations')}
              type="button"
            >
              Locations
            </button>
          </div>

          {settingsSection === 'grid' ? (
            <div className="settings-section">
              <p className="settings-copy">This is the live navigation grid the staff are routing on right now. Click or drag across cells to multi-select them.</p>

              <div className="settings-actions">
                <button className="settings-action" onClick={() => setSelectedGridCells([])} type="button">
                  Clear
                </button>
                <button className="settings-action" onClick={() => setSelectedGridCells(gridCells.filter((cell) => navigation.walkable[cell.index] === 1).map((cell) => cell.index))} type="button">
                  Select walkable
                </button>
                <button className="settings-action" onClick={() => setRevealLocations((current) => !current)} type="button">
                  {revealLocations ? 'Hide locations' : 'Reveal locations'}
                </button>
                <button className="settings-action is-primary" disabled={selectedGridCells.length === 0} onClick={copySelectedGrid} type="button">
                  Copy selection
                </button>
                <button className="settings-action is-primary" disabled={selectedGridCells.length === 0} onClick={handleApplySelectedGrid} type="button">
                  Apply selection
                </button>
              </div>

              <div className="settings-metrics">
                <span>{selectedGridCells.length} selected</span>
                <span>{selectedWalkableCount} walkable</span>
                <span>{copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Ready'}</span>
                <span>{applyStatus === 'applied' ? 'Applied' : applyStatus === 'failed' ? 'Apply failed' : 'Idle'}</span>
              </div>

              <div className="grid-import-panel">
                <label className="grid-import-label" htmlFor="grid-json-input">
                  Paste grid JSON
                </label>
                <textarea
                  className="grid-import-textarea"
                  id="grid-json-input"
                  onChange={(event) => {
                    setGridJsonInput(event.target.value);
                    setApplyStatus('idle');
                  }}
                  placeholder="Paste copied grid JSON here, then click Apply pasted grid."
                  value={gridJsonInput}
                />
                <button className="settings-action is-primary" disabled={gridJsonInput.trim().length === 0} onClick={handleApplyGridJson} type="button">
                  Apply pasted grid
                </button>
              </div>

              {revealLocations ? (
                <div className="settings-location-list">
                  {visibleLocations.map((location) => {
                    const cellIndex = closestWalkableIndex(navigation, location.marker);
                    return (
                      <div className="settings-location-row" key={location.id}>
                        <span>{location.label}</span>
                        <span>
                          c{cellIndex % navigation.cols} r{Math.floor(cellIndex / navigation.cols)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {settingsSection === 'locations' ? (
            <div className="settings-section">
              <p className="settings-copy">Pick a location, then click any cell on the map to place it exactly there.</p>

              <div className="settings-actions">
                <button className="settings-action" onClick={() => setRevealLocations((current) => !current)} type="button">
                  {revealLocations ? 'Hide locations' : 'Reveal locations'}
                </button>
                <button className="settings-action" onClick={handleResetLocations} type="button">
                  Reset draft
                </button>
                <button className="settings-action is-primary" onClick={handleApplyLocations} type="button">
                  Apply locations
                </button>
              </div>

              <div className="settings-metrics">
                <span>{selectedLocation?.label ?? 'No location selected'}</span>
                <span>{locationApplyStatus === 'applied' ? 'Applied' : 'Draft'}</span>
              </div>

              <div className="settings-location-list">
                {locationDraft.map((location) => (
                  <button
                    className={`settings-location-button ${location.id === selectedLocationId ? 'is-active' : ''}`}
                    key={location.id}
                    onClick={() => setSelectedLocationId(location.id)}
                    type="button"
                  >
                    <span>{location.label}</span>
                    <span>
                      c{exactCellIndexForPoint(navigation, location.marker) % navigation.cols} r{Math.floor(exactCellIndexForPoint(navigation, location.marker) / navigation.cols)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
                <strong>{apiLive ? 'Live tokens enabled' : 'Local scripted test'}</strong>
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
                <span className="metric-label">Runner</span>
                <strong>{runnerStatus}</strong>
              </div>
            </div>
          </header>

          <div className="dashboard-scroll">
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
                <p className="dossier-bio">{entry.bio}</p>
                <ul className="dossier-list">
                  {entry.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`office-stage ${view === 'dashboard' ? 'is-hidden' : 'is-fullscreen'}`}>
        <img alt="Office map" className="office-map" draggable={false} src={officeMap} />

        {shouldShowGrid || shouldShowLocationEditor ? (
          <div className="grid-overlay">
            {gridCells.map((cell) => {
              const isWalkable = navigation.walkable[cell.index] === 1;
              const isSelected = selectedGridCellSet.has(cell.index);
              const isLocationCell = shouldShowLocationEditor && selectedLocation ? exactCellIndexForPoint(navigation, selectedLocation.marker) === cell.index : false;

              return (
                <button
                  className={`grid-cell ${isWalkable ? 'is-walkable' : 'is-blocked'} ${isSelected ? 'is-selected' : ''} ${isLocationCell ? 'is-location-target' : ''} ${shouldShowLocationEditor ? 'is-location-mode' : ''}`}
                  key={cell.index}
                  onPointerDown={() => {
                    if (shouldShowLocationEditor) {
                      placeSelectedLocation(cell.index);
                      return;
                    }

                    beginGridSelection(cell.index);
                  }}
                  onPointerEnter={() => {
                    if (shouldShowLocationEditor) {
                      return;
                    }

                    if (gridSelectionMode) {
                      updateGridSelection(cell.index, gridSelectionMode);
                    }
                  }}
                  style={cell.style}
                  type="button"
                />
              );
            })}
          </div>
        ) : null}

        {(shouldShowGrid || shouldShowLocationEditor) && revealLocations ? (
          <div className="location-reveal-layer">
            {visibleLocations.map((location) => {
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
          </div>
        ) : null}

        {fixedStaffProfiles.map((staff) => {
          const location = locationById(staff.locationId, locations);
          if (!location) {
            return null;
          }

          const backendEmployee = employeeById(employeeSnapshot, staff.id);
          const mover = staffTest.movers[staff.id];
          const x = staffTest.testing && mover ? mover.x : location.marker.x;
          const y = staffTest.testing && mover ? mover.y : location.marker.y;
          const frameIndex = staffTest.testing && mover ? mover.frameIndex : fixedStaffFrame(staff.direction, world.tick, staff.animationOffset);
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

          return (
            <div
              className="office-actor"
              key={actorId}
              style={{ ...actorStyle(actor.x, actor.y, SPRITE_SIZE), opacity: shouldShowGrid ? 0.38 : 1, pointerEvents: shouldShowGrid ? 'none' : 'auto' }}
            >
              <div className="pixel-sprite office-sprite" style={getSpriteStyle(profile.strip, actor.frameIndex)} />
            </div>
          );
        })}
      </section>
    </main>
  );
}
