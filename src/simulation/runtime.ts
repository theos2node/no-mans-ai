export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }
  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
  integer(max: number): number {
    return Math.floor(this.next() * max);
  }
}

export class LogicalClock {
  public tick: number;
  constructor(tick = 0) {
    this.tick = tick;
  }
  advance(ticks = 1): number {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error("Clock ticks must be a non-negative integer");
    }
    this.tick += ticks;
    return this.tick;
  }
}

export class DeterministicIds {
  private counters = new Map<string, number>();
  private readonly runId: string;
  constructor(runId: string) {
    this.runId = runId;
  }
  next(kind: string): string {
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return `${this.runId}-${kind}-${String(n).padStart(3, "0")}`;
  }
}
