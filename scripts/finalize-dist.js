/**
 * Stamp each dist flavor with a minimal package.json declaring its module
 * system, so Node interprets `dist/esm/*.js` as ESM and `dist/cjs/*.js` as
 * CommonJS regardless of the root package's `type` field.
 */
const fs = require("fs");
const path = require("path");

const stubs = [
  ["dist/cjs", { type: "commonjs" }],
  ["dist/esm", { type: "module" }],
];

for (const [dir, contents] of stubs) {
  const target = path.join(__dirname, "..", dir, "package.json");
  fs.writeFileSync(target, JSON.stringify(contents, null, 2) + "\n");
  console.log(`wrote ${dir}/package.json`);
}
