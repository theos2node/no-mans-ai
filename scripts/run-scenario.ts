import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeterministicSimulationRunner } from "../src/simulation/runner.ts";

const scenarioName = process.argv[2];
const jsonOutput = process.argv.includes("--json");
if (!scenarioName) {
  console.error("Usage: npm run scenario -- <scenario> [--json]");
  process.exit(1);
}
const file = resolve(process.cwd(), "scenarios", `${scenarioName}.json`);
const runner = new DeterministicSimulationRunner(
  JSON.parse(readFileSync(file, "utf8")),
  `${scenarioName}-run`,
);
const result = runner.runToCompletion();
if (jsonOutput) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`${result.scenarioId}: ${result.status} (seed ${result.seed})`);
  console.log(
    `actions ${result.metrics.actions}, movement ${result.metrics.movementTicks}, waiting ${result.metrics.waitingTicks}, requests ${result.metrics.requests}, approvals ${result.metrics.approvals}`,
  );
  console.log(
    `goals ${
      result.metrics.goals.filter((goal) => goal.satisfied).length
    }/${result.metrics.goals.length}, events ${result.events.length}`,
  );
}
