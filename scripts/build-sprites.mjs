import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const SLOT_SIZE = 112;
const FRAMES_PER_STRIP = 12;
const WHITE_THRESHOLD = 245;
const BG_TOLERANCE = 42;
const SPRITE_PADDING = 6;
const TARGET_SPRITE_HEIGHT = 82;
const MAX_SLOT_CONTENT = 104;
const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const sourceDirectoryArgument = process.argv[2] ?? process.env.SPRITE_SOURCE_DIR;

if (!sourceDirectoryArgument) {
  throw new Error(
    'Provide a source directory: npm run build:sprites -- ./path/to/source-strips ' +
      'or set SPRITE_SOURCE_DIR.',
  );
}

const sourceDirectory = path.resolve(sourceDirectoryArgument);
const outputDirectory = path.resolve(
  process.env.SPRITE_OUTPUT_DIR ?? path.join(ROOT_DIR, 'src/assets'),
);
const spriteNames = [
  'sam',
  'jeremy',
  'june-liaison',
  'ellis-accounting',
  'nia-service',
  'rowan-manager',
  'petra-quality',
  'ava-react-a',
  'milo-react-b',
];
const jobs = spriteNames.map((name) => ({
  input: path.join(sourceDirectory, `${name}.png`),
  output: path.join(outputDirectory, `${name}-walk.png`),
}));

await fs.promises.mkdir(outputDirectory, { recursive: true });

for (const job of jobs) {
  const png = PNG.sync.read(fs.readFileSync(job.input));
  const segments = detectSegments(png);

  if (segments.length !== FRAMES_PER_STRIP) {
    throw new Error(`Expected ${FRAMES_PER_STRIP} frames in ${job.input}, found ${segments.length}.`);
  }

  const rawFrames = segments.map((segment) => processFrame(png, segment.start, segment.end));
  const maxFrameWidth = Math.max(...rawFrames.map((frame) => frame.width));
  const maxFrameHeight = Math.max(...rawFrames.map((frame) => frame.height));
  const sharedScale = Math.min(
    TARGET_SPRITE_HEIGHT / maxFrameHeight,
    MAX_SLOT_CONTENT / maxFrameWidth,
    MAX_SLOT_CONTENT / maxFrameHeight,
  );
  const frames = rawFrames.map((frame) => {
    const scaled = scaleNearest(frame.png, sharedScale);
    return {
      png: scaled,
      width: scaled.width,
      height: scaled.height,
    };
  });
  const sheet = new PNG({
    width: SLOT_SIZE * frames.length,
    height: SLOT_SIZE,
  });

  for (const [frameIndex, frame] of frames.entries()) {
    const offsetX = frameIndex * SLOT_SIZE + Math.round((SLOT_SIZE - frame.width) / 2);
    const offsetY = SLOT_SIZE - frame.height - SPRITE_PADDING;
    blit(frame.png, sheet, 0, 0, frame.width, frame.height, offsetX, offsetY);
  }

  fs.writeFileSync(job.output, PNG.sync.write(sheet));
}

function detectSegments(png) {
  const activeColumns = [];

  for (let x = 0; x < png.width; x += 1) {
    let hasColor = false;

    for (let y = 0; y < png.height; y += 1) {
      const { r, g, b, a } = getPixel(png, x, y);
      if (a > 0 && !isNearWhite(r, g, b)) {
        hasColor = true;
        break;
      }
    }

    activeColumns.push(hasColor);
  }

  const segments = [];
  let start = -1;

  activeColumns.forEach((active, x) => {
    if (active && start === -1) {
      start = x;
    }

    const nextInactive = !active && start !== -1;
    const atEnd = active && start !== -1 && x === activeColumns.length - 1;

    if (nextInactive) {
      segments.push({ start, end: x - 1 });
      start = -1;
    } else if (atEnd) {
      segments.push({ start, end: x });
      start = -1;
    }
  });

  return segments;
}

function processFrame(source, startX, endX) {
  const frame = crop(source, startX, endX - startX + 1, 0, source.height);
  const bg = detectBackground(frame);
  clearEdgeConnectedBackground(frame, bg);
  const box = findBoundingBox(frame);

  if (!box) {
    throw new Error('Frame became empty after background removal.');
  }

  const content = crop(
    frame,
    Math.max(0, box.left - SPRITE_PADDING),
    Math.min(frame.width - box.left, box.right - box.left + 1 + SPRITE_PADDING * 2),
    Math.max(0, box.top - SPRITE_PADDING),
    Math.min(frame.height - box.top, box.bottom - box.top + 1 + SPRITE_PADDING * 2),
  );
  return {
    png: content,
    width: content.width,
    height: content.height,
  };
}

function detectBackground(frame) {
  const counts = new Map();

  const borderPixels = [];

  for (let x = 0; x < frame.width; x += 1) {
    borderPixels.push([x, 0], [x, frame.height - 1]);
  }

  for (let y = 1; y < frame.height - 1; y += 1) {
    borderPixels.push([0, y], [frame.width - 1, y]);
  }

  for (const [x, y] of borderPixels) {
    const { r, g, b, a } = getPixel(frame, x, y);
    if (a === 0 || isNearWhite(r, g, b)) {
      continue;
    }

    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) {
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const { r, g, b, a } = getPixel(frame, x, y);
        if (a === 0 || isNearWhite(r, g, b)) {
          continue;
        }

        const key = `${r},${g},${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  const winner = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .at(0);

  if (!winner) {
    throw new Error('Unable to detect frame background color.');
  }

  const [key] = winner;
  const [r, g, b] = key.split(',').map(Number);
  return { r, g, b };
}

function clearEdgeConnectedBackground(frame, bg) {
  const visited = new Uint8Array(frame.width * frame.height);
  const queue = [];

  const tryQueue = (x, y) => {
    const visitIndex = frame.width * y + x;
    if (visited[visitIndex]) {
      return;
    }

    const { r, g, b, a } = getPixel(frame, x, y);
    if (a === 0) {
      visited[visitIndex] = 1;
      return;
    }

    if (!isNearWhite(r, g, b) && colorDistance({ r, g, b }, bg) > BG_TOLERANCE) {
      return;
    }

    visited[visitIndex] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < frame.width; x += 1) {
    tryQueue(x, 0);
    tryQueue(x, frame.height - 1);
  }

  for (let y = 1; y < frame.height - 1; y += 1) {
    tryQueue(0, y);
    tryQueue(frame.width - 1, y);
  }

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const index = (frame.width * y + x) << 2;
    frame.data[index + 3] = 0;

    if (x > 0) {
      tryQueue(x - 1, y);
    }
    if (x < frame.width - 1) {
      tryQueue(x + 1, y);
    }
    if (y > 0) {
      tryQueue(x, y - 1);
    }
    if (y < frame.height - 1) {
      tryQueue(x, y + 1);
    }
  }
}

function colorDistance(left, right) {
  return Math.sqrt((left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2);
}

function findBoundingBox(frame) {
  let left = frame.width;
  let right = -1;
  let top = frame.height;
  let bottom = -1;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const { a } = getPixel(frame, x, y);
      if (a === 0) {
        continue;
      }

      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right === -1) {
    return null;
  }

  return { left, right, top, bottom };
}

function crop(source, x, width, y, height) {
  const result = new PNG({ width, height });
  blit(source, result, x, y, width, height, 0, 0);
  return result;
}

function scaleNearest(source, factor) {
  const width = Math.max(1, Math.round(source.width * factor));
  const height = Math.max(1, Math.round(source.height * factor));
  const result = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / factor));
      const sourceY = Math.min(source.height - 1, Math.floor(y / factor));
      const sourceIndex = ((source.width * sourceY) + sourceX) << 2;
      const targetIndex = ((width * y) + x) << 2;

      result.data[targetIndex] = source.data[sourceIndex];
      result.data[targetIndex + 1] = source.data[sourceIndex + 1];
      result.data[targetIndex + 2] = source.data[sourceIndex + 2];
      result.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }

  return result;
}

function blit(source, target, sourceX, sourceY, width, height, targetX, targetY) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcIndex = ((source.width * (sourceY + y)) + (sourceX + x)) << 2;
      const dstIndex = ((target.width * (targetY + y)) + (targetX + x)) << 2;
      target.data[dstIndex] = source.data[srcIndex];
      target.data[dstIndex + 1] = source.data[srcIndex + 1];
      target.data[dstIndex + 2] = source.data[srcIndex + 2];
      target.data[dstIndex + 3] = source.data[srcIndex + 3];
    }
  }
}

function getPixel(png, x, y) {
  const index = (png.width * y + x) << 2;
  return {
    r: png.data[index],
    g: png.data[index + 1],
    b: png.data[index + 2],
    a: png.data[index + 3],
  };
}

function isNearWhite(r, g, b) {
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}
