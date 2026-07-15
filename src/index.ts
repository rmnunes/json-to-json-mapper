/**
 * json-to-json-mapper
 *
 * Remap one JSON shape into another from a declarative list of mappings.
 * The public entry point is {@link map}; it is a pure function with no
 * runtime dependencies.
 */

import { compactArraysDeep, extract, leafPaths, setValue } from "./paths.js";
import { applyCast, applyLookup, type Cast } from "./transform.js";

export type { Cast, CastName } from "./transform.js";

/** A single source-to-target rule. */
export interface Mapping {
  /** Dot-path into the input, e.g. `request.order.id`. Arrays are traversed. */
  source: string;
  /** Dot-path into the output. Use `$` to denote an array level. */
  target: string;
  /** Coerce the value's type: `"string" | "number" | "boolean"` (or the matching constructor). */
  cast?: Cast;
  /** Substitute the value via a lookup table or TypeScript enum. */
  lookup?: Record<string | number, unknown>;
  /** Arbitrary transform, applied last. */
  transform?: (value: unknown) => unknown;
  /** Value to use when the source resolves to nothing. */
  default?: unknown;
  /** Keep only the first matched value (for a scalar target fed by an array source). */
  first?: boolean;
}

/** A structured error for one mapping that could not be fully applied. */
export interface MappingError {
  source?: string;
  target?: string;
  message: string;
}

/** The outcome of a {@link map} call. */
export interface MapResult<T = Record<string, unknown>> {
  /** The remapped object. */
  result: T;
  /** Input leaf paths that no mapping consumed. */
  skipped: string[];
  /** Problems encountered while mapping (never thrown; always collected here). */
  errors: MappingError[];
}

export interface MapOptions {
  /** Merge the result into this object instead of a fresh one. */
  into?: Record<string, unknown>;
  /**
   * Report an error when a mapping's source resolves to nothing and no
   * `default` is provided (instead of silently skipping it).
   */
  strict?: boolean;
  /**
   * Remove holes from arrays in the result. By default, source array
   * positions are preserved (a skipped element leaves an empty slot) so
   * multiple field-mappings stay aligned; enable this to get dense arrays
   * once alignment no longer matters.
   */
  compactArrays?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyValueTransforms(mapping: Mapping, value: unknown): unknown {
  let next = value;
  if (mapping.lookup) next = applyLookup(mapping.lookup, next);
  if (mapping.cast) next = applyCast(mapping.cast, next);
  if (mapping.transform) next = mapping.transform(next);
  return next;
}

function applyMapping(
  input: unknown,
  mapping: Mapping,
  result: Record<string, unknown>,
  errors: MappingError[],
  strict: boolean
): void {
  if (!mapping || typeof mapping.source !== "string" || typeof mapping.target !== "string") {
    errors.push({
      source: mapping?.source,
      target: mapping?.target,
      message: "Mapping must have string 'source' and 'target'",
    });
    return;
  }

  const sourceParts = mapping.source.split(".");
  const targetParts = mapping.target.split(".");
  const arrayLevels = targetParts.filter((part) => part === "$").length;

  let matches = extract(input, sourceParts).filter((m) => m.value !== undefined);

  if (matches.length === 0) {
    if ("default" in mapping) {
      matches = [{ value: mapping.default, path: [] }];
    } else {
      if (strict) {
        errors.push({
          source: mapping.source,
          target: mapping.target,
          message: `Source '${mapping.source}' resolved to no values`,
        });
      }
      return; // Absent optional source: only an error in strict mode.
    }
  }

  if (mapping.first) {
    matches = matches.slice(0, 1);
  }

  if (arrayLevels === 0 && matches.length > 1) {
    errors.push({
      source: mapping.source,
      target: mapping.target,
      message: `Source resolved to ${matches.length} values but target is scalar; use first:true or a '$' target`,
    });
    matches = matches.slice(0, 1);
  }

  for (const match of matches) {
    let value: unknown;
    try {
      value = applyValueTransforms(mapping, match.value);
    } catch (error) {
      errors.push({ source: mapping.source, target: mapping.target, message: errorMessage(error) });
      continue;
    }
    try {
      setValue(result, targetParts, value, match.path);
    } catch (error) {
      errors.push({ source: mapping.source, target: mapping.target, message: errorMessage(error) });
    }
  }
}

function computeSkipped(input: unknown, mappings: Mapping[]): string[] {
  const consumed = new Set(mappings.map((mapping) => mapping?.source).filter(Boolean));
  return leafPaths(input).filter((path) => !consumed.has(path));
}

/**
 * Remap `input` into a new object according to `mappings`.
 *
 * Never throws for per-mapping problems — every failure is collected in the
 * returned `errors` array so a partial result is always available.
 *
 * @example
 * const { result } = map(
 *   { request: { order: { id: "1" } } },
 *   [{ source: "request.order.id", target: "app.ordering.number", cast: "number" }]
 * );
 * // result === { app: { ordering: { number: 1 } } }
 */
export function map<T = Record<string, unknown>>(
  input: unknown,
  mappings: Mapping[],
  options: MapOptions = {}
): MapResult<T> {
  if (!Array.isArray(mappings)) {
    throw new TypeError("mappings must be an array of Mapping objects");
  }

  const result = options.into ?? {};
  const errors: MappingError[] = [];

  for (const mapping of mappings) {
    applyMapping(input, mapping, result, errors, options.strict === true);
  }

  if (options.compactArrays) {
    compactArraysDeep(result);
  }

  return {
    result: result as T,
    skipped: computeSkipped(input, mappings),
    errors,
  };
}

export {
  compactArraysDeep,
  extract,
  leafPaths,
  setValue,
  isUnsafeKey,
} from "./paths.js";
export { applyCast, applyLookup } from "./transform.js";
