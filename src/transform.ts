/**
 * Value transformation: type casting and lookup-table substitution.
 * Each function throws a descriptive Error on failure; callers turn those
 * into structured entries in the `errors` array returned by `map`.
 */

export type CastName = "string" | "number" | "boolean";
export type Cast =
  | CastName
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", ""]);

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`Cannot cast ${JSON.stringify(value)} to boolean`);
}

/** Normalize a `Cast` (string name or constructor) to its lowercase name. */
function castName(cast: Cast): CastName {
  const name = typeof cast === "function" ? cast.name.toLowerCase() : cast;
  if (name === "string" || name === "number" || name === "boolean") {
    return name;
  }
  throw new Error(`Unsupported cast '${String(cast)}'`);
}

export function applyCast(cast: Cast, value: unknown): unknown {
  switch (castName(cast)) {
    case "number": {
      const result = Number(value);
      if (Number.isNaN(result)) {
        throw new Error(`Cannot cast ${JSON.stringify(value)} to number`);
      }
      return result;
    }
    case "string":
      return String(value);
    case "boolean":
      return toBoolean(value);
  }
}

/**
 * Substitute `value` using a lookup table. Plain objects and TypeScript enums
 * both work (an enum is just an object at runtime, including its reverse
 * numeric-to-name entries). Throws if there is no matching key.
 */
export function applyLookup(
  lookup: Record<string | number, unknown>,
  value: unknown
): unknown {
  const key = String(value);
  if (!Object.prototype.hasOwnProperty.call(lookup, key)) {
    throw new Error(`No lookup match for value ${JSON.stringify(value)}`);
  }
  return lookup[key];
}
