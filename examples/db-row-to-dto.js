/**
 * Example 2 — turning a flat database row into a nested DTO:
 * lookups (enum decoding), multi-source combination, and built-in
 * transforms via the registry.
 *
 * Run from the repo: pnpm run build && node examples/db-row-to-dto.js
 */
"use strict";

let lib;
try {
  lib = require("json-to-json-mapper");
} catch {
  lib = require("../dist/cjs/index.js");
}
const { compile } = lib;

const STATUS = { 1: "active", 2: "suspended", 3: "closed" };

const toCustomerDTO = compile(
  [
    { source: "customer_id", target: "id", cast: "number" },
    {
      sources: ["first_name", "last_name"],
      target: "name",
      transform: ([first, last]) => `${first} ${last}`.trim(),
    },
    { source: "email", target: "contact.email", transform: "lower" },
    { source: "status_code", target: "status", lookup: STATUS },
    { source: "created_at", target: "memberSince", transform: "toISODate" },
  ],
  { strict: true }
);

const rows = [
  {
    customer_id: "42",
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ADA@EXAMPLE.COM",
    status_code: 1,
    created_at: "2024-03-01T10:30:00Z",
  },
];

for (const row of rows) {
  const { result, errors } = toCustomerDTO(row);
  console.log(JSON.stringify({ result, errors }, null, 2));
  if (errors.length > 0 || result.status !== "active" || result.memberSince !== "2024-03-01") {
    console.error("db-row-to-dto example produced unexpected output");
    process.exit(1);
  }
}
console.log("db-row-to-dto example OK");
