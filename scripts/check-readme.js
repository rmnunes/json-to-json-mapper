/**
 * Doc-tests (M4): extract every fenced ts/js block from readme.md and
 * execute it against the built dist. A snippet that throws fails the build,
 * so the README cannot drift from the code — which is how this project
 * originally went wrong. Run after `pnpm run build`.
 *
 * Blocks marked with a `// doc-test: skip` line are skipped (none today).
 * Common free variables used by snippets (rows, registry, ...) are provided
 * by the prelude below.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIB = require(path.join(ROOT, "dist", "cjs", "index.js"));

const markdown = fs.readFileSync(path.join(ROOT, "readme.md"), "utf8");
const blocks = [...markdown.matchAll(/```(ts|js)\r?\n([\s\S]*?)```/g)];

if (blocks.length === 0) {
  console.error("check-readme: no ts/js blocks found — extraction broken?");
  process.exit(1);
}

// Free variables that snippets are allowed to assume exist. Library
// exports are ambient too — README convention: snippets after the first
// import don't repeat it. Blocks that do import shadow these harmlessly
// (each block body is wrapped in its own brace scope).
const CONTEXT = {
  map: LIB.map,
  compile: LIB.compile,
  validateMappings: LIB.validateMappings,
  input: { a: 1 },
  mappings: [{ source: "a", target: "b" }],
  rows: [{ id: "1" }, { id: "2" }],
  results: [],
  existingObject: {},
  mappingsFromConfig: [{ source: "a", target: "b" }],
  registry: { transforms: {}, lookups: { countries: { NL: "Netherlands" } } },
};

let failed = 0;
blocks.forEach(([, lang, code], index) => {
  if (code.includes("doc-test: skip")) {
    console.log(`skip  block ${index + 1} (${lang})`);
    return;
  }
  const rewritten = code.replace(
    /^\s*import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']json-to-json-mapper["'];?\s*$/gm,
    "const {$1} = LIB;"
  );
  try {
    const run = new Function(
      "LIB",
      ...Object.keys(CONTEXT),
      `"use strict";\n{\n${rewritten}\n}`
    );
    run(LIB, ...Object.values(CONTEXT));
    console.log(`ok    block ${index + 1} (${lang})`);
  } catch (error) {
    failed++;
    console.error(`FAIL  block ${index + 1} (${lang}): ${error && error.message}`);
    console.error(code.split("\n").map((line) => `      | ${line}`).join("\n"));
  }
});

if (failed > 0) {
  console.error(`\ncheck-readme: ${failed} of ${blocks.length} blocks failed`);
  process.exit(1);
}
console.log(`\ncheck-readme: all ${blocks.length} blocks executed cleanly`);
