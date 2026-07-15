/**
 * Example 1 — reshaping a third-party API response into your app's shape:
 * array fan-out with `$`, casting, defaults, and a `when` filter.
 *
 * Run from the repo: pnpm run build && node examples/api-response.js
 */
"use strict";

let lib;
try {
  lib = require("json-to-json-mapper");
} catch {
  lib = require("../dist/cjs/index.js");
}
const { map } = lib;

const apiResponse = {
  data: {
    orders: [
      { order_id: "1001", total_cents: "2499", status: "paid" },
      { order_id: "1002", total_cents: "0", status: "cancelled" },
      { order_id: "1003", total_cents: "10350", status: "paid" },
    ],
    next_cursor: "abc123",
  },
};

const { result, skipped, errors } = map(
  apiResponse,
  [
    { source: "data.orders.order_id", target: "orders.$.id", cast: "number" },
    {
      source: "data.orders.total_cents",
      target: "orders.$.totalEUR",
      transform: (cents) => Number(cents) / 100,
    },
    { source: "data.orders.status", target: "orders.$.status" },
    { source: "data.next_cursor", target: "page.cursor", default: null },
  ],
  { compactArrays: true }
);

console.log(JSON.stringify({ result, skipped, errors }, null, 2));

if (errors.length > 0 || result.orders.length !== 3 || result.orders[0].totalEUR !== 24.99) {
  console.error("api-response example produced unexpected output");
  process.exit(1);
}
console.log("api-response example OK");
