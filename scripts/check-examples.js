/**
 * Run every example against the built dist; any non-zero exit fails the
 * build. Keeps examples/ from rotting the way unexecuted docs do.
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXAMPLES = [
  "examples/api-response.js",
  "examples/db-row-to-dto.js",
  "examples/config-file/run.js",
];

let failed = 0;
for (const example of EXAMPLES) {
  const run = spawnSync(process.execPath, [path.join(ROOT, example)], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (run.status === 0) {
    console.log(`ok    ${example}`);
  } else {
    failed++;
    console.error(`FAIL  ${example}\n${run.stdout}${run.stderr}`);
  }
}

if (failed > 0) {
  console.error(`\ncheck-examples: ${failed} of ${EXAMPLES.length} failed`);
  process.exit(1);
}
console.log(`\ncheck-examples: all ${EXAMPLES.length} examples passed`);
