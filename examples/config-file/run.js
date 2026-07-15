/**
 * Example 3 — mapping definitions as *data*: loaded from a JSON file
 * (they could equally come from a database row), statically validated with
 * validateMappings, then executed with a named-transform registry.
 *
 * The mapping file conforms to the shipped JSON Schema
 * (schema/mapping.schema.json), so editors and CI can validate it too.
 *
 * Run from the repo: pnpm run build && node examples/config-file/run.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

let lib;
try {
  lib = require("json-to-json-mapper");
} catch {
  lib = require("../../dist/cjs/index.js");
}
const { map, validateMappings } = lib;

const mappings = JSON.parse(fs.readFileSync(path.join(__dirname, "mapping.json"), "utf8"));

const registry = {
  transforms: { joinComma: (values) => values.filter(Boolean).join(", ") },
  lookups: { locales: { nl: "Dutch", pt: "Portuguese", en: "English" } },
};

// Validate before running — in a real system, do this in CI or before
// persisting the definitions. Zero issues means safe to deploy.
const issues = validateMappings(mappings, { registry });
if (issues.length > 0) {
  console.error("mapping.json is invalid:", issues);
  process.exit(1);
}

const input = {
  user: {
    given_name: "  Rodrigo ",
    locale: "pt",
    signup_ts: "2022-06-30T08:00:00Z",
    city: "Lisbon",
    country: "Portugal",
  },
};

const { result, errors } = map(input, mappings, { registry });
console.log(JSON.stringify({ result, errors }, null, 2));

if (
  errors.length > 0 ||
  result.profile.firstName !== "Rodrigo" ||
  result.profile.language !== "Portuguese" ||
  result.profile.location !== "Lisbon, Portugal"
) {
  console.error("config-file example produced unexpected output");
  process.exit(1);
}
console.log("config-file example OK");
