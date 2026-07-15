/**
 * Value transformation: type casting, lookup-table substitution, and the
 * named-transform registry that makes mapping definitions serializable.
 * Each function throws a {@link CodedError} on failure; callers turn those
 * into structured entries in the `errors` array returned by `map`.
 */

import { CodedError } from "./errors.js";

export type CastName = "string" | "number" | "boolean";
export type Cast =
  | CastName
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor;

export type TransformFn = (value: any) => unknown;
export type LookupTable = Record<string | number, unknown>;

/**
 * Named transforms and lookup tables, so mapping definitions can reference
 * them as strings — which makes the definitions pure JSON, storable in a
 * config file or database and validatable with `validateMappings` or the
 * shipped JSON Schema.
 */
export interface Registry {
  transforms?: Record<string, TransformFn>;
  lookups?: Record<string, LookupTable>;
}

/** Built-in named transforms, always available; a user registry adds to (and can shadow) these. */
export const BUILTIN_TRANSFORMS: Record<string, TransformFn> = {
  trim: (value) => String(value).trim(),
  upper: (value) => String(value).toUpperCase(),
  lower: (value) => String(value).toLowerCase(),
  /** ISO 8601 calendar date (`YYYY-MM-DD`) from anything Date can parse. */
  toISODate: (value) => {
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) {
      throw new CodedError("TRANSFORM_FAILED", `Cannot parse ${JSON.stringify(value)} as a date`);
    }
    return date.toISOString().slice(0, 10);
  },
};

/** Resolve a transform reference (function or registry name) to a function. */
export function resolveTransform(
  transform: TransformFn | string,
  registry: Registry | undefined
): TransformFn {
  if (typeof transform === "function") return transform;
  const named = registry?.transforms?.[transform] ?? BUILTIN_TRANSFORMS[transform];
  if (typeof named !== "function") {
    throw new CodedError("INVALID_MAPPING", `Unknown transform '${transform}' (not in registry or built-ins)`);
  }
  return named;
}

/** Resolve a lookup reference (table or registry name) to a table. */
export function resolveLookup(
  lookup: LookupTable | string,
  registry: Registry | undefined
): LookupTable {
  if (typeof lookup !== "string") return lookup;
  const named = registry?.lookups?.[lookup];
  if (named === undefined) {
    throw new CodedError("INVALID_MAPPING", `Unknown lookup '${lookup}' (not in registry)`);
  }
  return named;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", ""]);

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new CodedError("CAST_FAILED", `Cannot cast ${JSON.stringify(value)} to boolean`);
}

/** Normalize a `Cast` (string name or constructor) to its lowercase name. */
export function castName(cast: Cast): CastName {
  const name = typeof cast === "function" ? cast.name.toLowerCase() : cast;
  if (name === "string" || name === "number" || name === "boolean") {
    return name;
  }
  throw new CodedError("INVALID_MAPPING", `Unsupported cast '${String(cast)}'`);
}

export function applyCast(cast: Cast, value: unknown): unknown {
  switch (castName(cast)) {
    case "number": {
      const result = Number(value);
      if (Number.isNaN(result)) {
        throw new CodedError("CAST_FAILED", `Cannot cast ${JSON.stringify(value)} to number`);
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
export function applyLookup(lookup: LookupTable, value: unknown): unknown {
  const key = String(value);
  if (!Object.prototype.hasOwnProperty.call(lookup, key)) {
    throw new CodedError("LOOKUP_MISS", `No lookup match for value ${JSON.stringify(value)}`);
  }
  return lookup[key];
}
