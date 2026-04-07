import defaultGridSelection from './default-grid-selection.json';

export type ActorId = 'sam' | 'jeremy';
export type Direction = 'down' | 'up' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface OfficeLocation {
  id: string;
  label: string;
  marker: Point;
  targets: Record<ActorId, Point>;
}

export interface NavigationGrid {
  cols: number;
  rows: number;
  cellSize: number;
  walkable: Uint8Array;
}

export interface GridColumnCoordinate {
  col: number;
  startX: number;
  endX: number;
  centerX: number;
}

export interface GridCellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DefaultGridSelectionCell {
  index: number;
  col: number;
  row: number;
  walkable: boolean;
}

interface DefaultGridSelection {
  version: number;
  mapWidth: number;
  mapHeight: number;
  cellSize: number;
  selectedCells: DefaultGridSelectionCell[];
}

export const MAP_WIDTH = 3464;
export const MAP_HEIGHT = 1184;
export const CELL_SIZE = 28;
export const EDIT_TILE_SIZE = CELL_SIZE * 2;
export const TILE_TICKS = 2;

const neighborOffsets = [
  { dc: 0, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
] as const;

const locationIdAliases: Partial<Record<string, string[]>> = {
  'customer-service': ['customer-relations'],
  'quality-inspector': ['quality-assurance'],
  accounting: ['coordinator'],
};

function pointFromCell(grid: NavigationGrid, col: number, row: number): Point {
  const { x, y, width, height } = cellBoundsForCoords(grid, col, row);
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
}

export const officeLocations: OfficeLocation[] = [
  {
    id: 'break-room',
    label: 'Break Room',
    marker: { x: 908, y: 705 },
    targets: {
      sam: { x: 834, y: 668 },
      jeremy: { x: 916, y: 668 },
    },
  },
  {
    id: 'react-a',
    label: 'React A',
    marker: { x: 1114, y: 374 },
    targets: {
      sam: { x: 1114, y: 374 },
      jeremy: { x: 1114, y: 374 },
    },
  },
  {
    id: 'react-b',
    label: 'React B',
    marker: { x: 1450, y: 374 },
    targets: {
      sam: { x: 1450, y: 374 },
      jeremy: { x: 1450, y: 374 },
    },
  },
  {
    id: 'react-c',
    label: 'React C',
    marker: { x: 1358, y: 546 },
    targets: {
      sam: { x: 1358, y: 546 },
      jeremy: { x: 1358, y: 546 },
    },
  },
  {
    id: 'react-d',
    label: 'React D',
    marker: { x: 1618, y: 542 },
    targets: {
      sam: { x: 1618, y: 542 },
      jeremy: { x: 1618, y: 542 },
    },
  },
  {
    id: 'customer-relations',
    label: 'Customer Relations',
    marker: { x: 2226, y: 1078 },
    targets: {
      sam: { x: 2226, y: 1078 },
      jeremy: { x: 2226, y: 1078 },
    },
  },
  {
    id: 'war-room',
    label: 'War Room',
    marker: { x: 3402, y: 966 },
    targets: {
      sam: { x: 3374, y: 966 },
      jeremy: { x: 3402, y: 966 },
    },
  },
  {
    id: 'coordinator',
    label: 'Coordinator',
    marker: { x: 2506, y: 742 },
    targets: {
      sam: { x: 2506, y: 742 },
      jeremy: { x: 2506, y: 742 },
    },
  },
  {
    id: 'it-support',
    label: 'IT Support',
    marker: { x: 618, y: 458 },
    targets: {
      sam: { x: 618, y: 458 },
      jeremy: { x: 618, y: 458 },
    },
  },
  {
    id: 'red-terminal',
    label: 'Red Terminal',
    marker: { x: 2929, y: 658 },
    targets: {
      sam: { x: 2845, y: 832 },
      jeremy: { x: 2927, y: 832 },
    },
  },
  {
    id: 'archives',
    label: 'Archives',
    marker: { x: 3152, y: 160 },
    targets: {
      sam: { x: 3130, y: 559 },
      jeremy: { x: 3239, y: 532 },
    },
  },
  {
    id: 'quality-assurance',
    label: 'Quality Assurance',
    marker: { x: 2422, y: 1078 },
    targets: {
      sam: { x: 2422, y: 1078 },
      jeremy: { x: 2422, y: 1078 },
    },
  },
  {
    id: 'general-manager',
    label: 'General Manager',
    marker: { x: 2450, y: 178 },
    targets: {
      sam: { x: 2450, y: 178 },
      jeremy: { x: 2450, y: 178 },
    },
  },
];

const fallbackWalkableTileSpans: Array<{ row: number; spans: Array<[number, number]> }> = [
  { row: 5, spans: [[38, 40]] },
  { row: 6, spans: [[38, 40]] },
  { row: 7, spans: [[0, 19], [24, 30], [33, 45], [50, 60]] },
  { row: 8, spans: [[0, 3], [9, 19], [24, 25], [39, 42], [56, 58]] },
  { row: 9, spans: [[0, 2], [10, 12], [24, 25], [39, 41], [56, 58]] },
  { row: 10, spans: [[0, 1], [11, 11], [24, 25], [39, 41], [56, 58]] },
  { row: 11, spans: [[0, 1], [11, 11], [24, 25], [39, 41], [56, 58]] },
  { row: 12, spans: [[0, 1], [11, 11], [24, 25], [39, 43], [56, 58]] },
  { row: 13, spans: [[0, 1], [11, 11], [24, 45], [56, 60]] },
  { row: 14, spans: [[0, 1], [10, 11], [24, 25], [41, 45], [56, 60]] },
  { row: 15, spans: [[0, 2], [9, 11], [24, 25], [41, 45], [51, 60]] },
  { row: 16, spans: [[0, 13], [21, 25], [41, 45], [51, 60]] },
  { row: 17, spans: [[11, 13], [21, 25], [41, 45], [51, 60]] },
  { row: 18, spans: [[11, 25], [41, 62]] },
  { row: 19, spans: [[11, 25], [41, 62]] },
  { row: 20, spans: [[11, 60]] },
];

function withinBounds(grid: NavigationGrid, col: number, row: number) {
  return col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;
}

function cellIndex(grid: NavigationGrid, col: number, row: number) {
  return row * grid.cols + col;
}

function carveRect(grid: NavigationGrid, col0: number, row0: number, col1: number, row1: number) {
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      if (!withinBounds(grid, col, row)) {
        continue;
      }

      grid.walkable[cellIndex(grid, col, row)] = 1;
    }
  }
}

function carveEditTile(grid: NavigationGrid, tileCol: number, tileRow: number) {
  const x = tileCol * EDIT_TILE_SIZE;
  const y = tileRow * EDIT_TILE_SIZE;
  const width = Math.min(EDIT_TILE_SIZE, MAP_WIDTH - x);
  const height = Math.min(EDIT_TILE_SIZE, MAP_HEIGHT - y);
  const startCol = Math.floor(x / CELL_SIZE);
  const endCol = Math.min(grid.cols - 1, Math.floor((x + width - 1) / CELL_SIZE));
  const startRow = Math.floor(y / CELL_SIZE);
  const endRow = Math.min(grid.rows - 1, Math.floor((y + height - 1) / CELL_SIZE));

  carveRect(grid, startCol, startRow, endCol, endRow);
}

function applyGridSelection(grid: NavigationGrid, selection: DefaultGridSelection) {
  for (const cell of selection.selectedCells) {
    if (cell.index < 0 || cell.index >= grid.walkable.length) {
      continue;
    }

    grid.walkable[cell.index] = cell.walkable ? 1 : 0;
  }
}

function squaredDistance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function cellBoundsForCoords(grid: NavigationGrid, col: number, row: number): GridCellBounds {
  const x = col * grid.cellSize;
  const y = row * grid.cellSize;
  return {
    x,
    y,
    width: Math.min(grid.cellSize, MAP_WIDTH - x),
    height: Math.min(grid.cellSize, MAP_HEIGHT - y),
  };
}

export function createEmptyNavigationGrid(): NavigationGrid {
  const cols = Math.ceil(MAP_WIDTH / CELL_SIZE);
  const rows = Math.ceil(MAP_HEIGHT / CELL_SIZE);
  return {
    cols,
    rows,
    cellSize: CELL_SIZE,
    walkable: new Uint8Array(cols * rows),
  };
}

export function buildNavigationGrid(): NavigationGrid {
  const grid = createEmptyNavigationGrid();

  const selection = defaultGridSelection as DefaultGridSelection;
  const canUseSelectionAsDefault =
    selection &&
    selection.mapWidth === MAP_WIDTH &&
    selection.mapHeight === MAP_HEIGHT &&
    selection.cellSize === CELL_SIZE &&
    Array.isArray(selection.selectedCells) &&
    selection.selectedCells.length > 0;

  if (canUseSelectionAsDefault) {
    applyGridSelection(grid, selection);
    return grid;
  }

  for (const rowConfig of fallbackWalkableTileSpans) {
    for (const [startCol, endCol] of rowConfig.spans) {
      for (let col = startCol; col <= endCol; col += 1) {
        carveEditTile(grid, col, rowConfig.row);
      }
    }
  }

  return grid;
}

export function cellCenter(grid: NavigationGrid, index: number): Point {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);

  return pointFromCell(grid, col, row);
}

export function cellBounds(grid: NavigationGrid, index: number): GridCellBounds {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return cellBoundsForCoords(grid, col, row);
}

export function buildGridColumns(grid: NavigationGrid): GridColumnCoordinate[] {
  return Array.from({ length: grid.cols }, (_, col) => {
    const startX = col * grid.cellSize;
    const endX = Math.min(MAP_WIDTH, startX + grid.cellSize);
    return {
      col,
      startX,
      endX,
      centerX: startX + (endX - startX) / 2,
    };
  });
}

export function gridIndexForPoint(grid: NavigationGrid, point: Point) {
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(point.x / grid.cellSize)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(point.y / grid.cellSize)));
  return row * grid.cols + col;
}

export function isWalkableIndex(grid: NavigationGrid, index: number) {
  return grid.walkable[index] === 1;
}

export function closestWalkableIndex(grid: NavigationGrid, point: Point) {
  const desiredIndex = gridIndexForPoint(grid, point);
  const desiredCol = desiredIndex % grid.cols;
  const desiredRow = Math.floor(desiredIndex / grid.cols);

  if (isWalkableIndex(grid, desiredIndex)) {
    return desiredIndex;
  }

  for (let radius = 1; radius < 10; radius += 1) {
    for (let row = desiredRow - radius; row <= desiredRow + radius; row += 1) {
      for (let col = desiredCol - radius; col <= desiredCol + radius; col += 1) {
        if (!withinBounds(grid, col, row)) {
          continue;
        }

        const onEdge =
          row === desiredRow - radius ||
          row === desiredRow + radius ||
          col === desiredCol - radius ||
          col === desiredCol + radius;

        if (!onEdge) {
          continue;
        }

        const index = cellIndex(grid, col, row);
        if (isWalkableIndex(grid, index)) {
          return index;
        }
      }
    }
  }

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < grid.walkable.length; index += 1) {
    if (!isWalkableIndex(grid, index)) {
      continue;
    }

    const center = cellCenter(grid, index);
    const dx = center.x - point.x;
    const dy = center.y - point.y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex >= 0 ? bestIndex : desiredIndex;
}

export function snapPointToWalkable(grid: NavigationGrid, point: Point) {
  return cellCenter(grid, closestWalkableIndex(grid, point));
}

export function normalizeOfficeLocations(grid: NavigationGrid, locations: OfficeLocation[]) {
  return locations.map((location) => {
    return {
      ...location,
      marker: snapPointToWalkable(grid, location.marker),
      targets: {
        sam: snapPointToWalkable(grid, location.targets.sam),
        jeremy: snapPointToWalkable(grid, location.targets.jeremy),
      },
    };
  });
}

function heuristic(grid: NavigationGrid, a: number, b: number) {
  const ax = a % grid.cols;
  const ay = Math.floor(a / grid.cols);
  const bx = b % grid.cols;
  const by = Math.floor(b / grid.cols);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function reconstructPath(cameFrom: Int32Array, current: number, start: number) {
  const path: number[] = [];
  let cursor = current;

  while (cursor !== start && cursor !== -1) {
    path.unshift(cursor);
    cursor = cameFrom[cursor];
  }

  return path;
}

export function findPath(grid: NavigationGrid, start: number, goal: number, blocked: Set<number>) {
  if (start === goal) {
    return [];
  }

  const total = grid.cols * grid.rows;
  const gScore = new Float64Array(total);
  const fScore = new Float64Array(total);
  const cameFrom = new Int32Array(total);
  const visited = new Uint8Array(total);

  gScore.fill(Number.POSITIVE_INFINITY);
  fScore.fill(Number.POSITIVE_INFINITY);
  cameFrom.fill(-1);

  const openSet: number[] = [start];
  gScore[start] = 0;
  fScore[start] = heuristic(grid, start, goal);

  while (openSet.length > 0) {
    let bestOpenIndex = 0;

    for (let index = 1; index < openSet.length; index += 1) {
      if (fScore[openSet[index]] < fScore[openSet[bestOpenIndex]]) {
        bestOpenIndex = index;
      }
    }

    const current = openSet.splice(bestOpenIndex, 1)[0];

    if (current === goal) {
      return reconstructPath(cameFrom, current, start);
    }

    visited[current] = 1;

    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);

    for (const offset of neighborOffsets) {
      const nextCol = col + offset.dc;
      const nextRow = row + offset.dr;

      if (!withinBounds(grid, nextCol, nextRow)) {
        continue;
      }

      const next = cellIndex(grid, nextCol, nextRow);
      if (!isWalkableIndex(grid, next)) {
        continue;
      }

      if (next !== goal && blocked.has(next)) {
        continue;
      }

      if (visited[next] === 1) {
        continue;
      }

      const tentative = gScore[current] + 1;
      if (tentative >= gScore[next]) {
        continue;
      }

      cameFrom[next] = current;
      gScore[next] = tentative;
      fScore[next] = tentative + heuristic(grid, next, goal);

      if (!openSet.includes(next)) {
        openSet.push(next);
      }
    }
  }

  return [];
}

export function directionBetween(grid: NavigationGrid, from: number, to: number): Direction {
  const fromCol = from % grid.cols;
  const fromRow = Math.floor(from / grid.cols);
  const toCol = to % grid.cols;
  const toRow = Math.floor(to / grid.cols);

  if (toCol > fromCol) {
    return 'right';
  }

  if (toCol < fromCol) {
    return 'left';
  }

  if (toRow > fromRow) {
    return 'down';
  }

  return 'up';
}

export function locationById(locationId: string, locations: OfficeLocation[] = officeLocations) {
  const direct = locations.find((location) => location.id === locationId);
  if (direct) {
    return direct;
  }

  const aliases = locationIdAliases[locationId] ?? [];
  return locations.find((location) => aliases.includes(location.id)) ?? null;
}
