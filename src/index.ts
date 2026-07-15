/**
 * json-to-json-mapper
 *
 * Remap one JSON shape into another from a declarative list of mappings.
 * The public entry point is {@link map}; it is a pure function with no
 * runtime dependencies.
 */

import { codeOf, type MappingErrorCode } from "./errors.js";
import {
  compactArraysDeep,
  extract,
  leafPaths,
  parsePath,
  pathLabel,
  setValue,
  type Path,
} from "./paths.js";
import {
  applyCast,
  applyLookup,
  resolveLookup,
  resolveTransform,
  type Cast,
  type LookupTable,
  type Registry,
  type TransformFn,
} from "./transform.js";

export type { Cast, CastName, LookupTable, Registry, TransformFn } from "./transform.js";
export type { Path } from "./paths.js";
export type { MappingErrorCode } from "./errors.js";

/** A single source-to-target rule. */
export interface Mapping {
  /**
   * Path into the input, e.g. `request.order.id`. Arrays are traversed;
   * a numeric segment picks one element. Use the array form
   * (`["a.b", "c"]`) or `\.` escaping for keys that contain dots.
   * Exactly one of `source` / `sources` must be present.
   */
  source?: Path;
  /**
   * Multiple input paths whose values are collected positionally into an
   * array and passed to `transform` (which is required). Each source
   * contributes its first matched value, or `undefined` when absent.
   */
  sources?: Path[];
  /** Path into the output. `$` denotes an array level; numeric segments write explicit positions. */
  target: Path;
  /** Coerce the value's type: `"string" | "number" | "boolean"` (or the matching constructor). */
  cast?: Cast;
  /**
   * Substitute the value via a lookup table, TypeScript enum, or the name
   * of a table in the registry. Not supported with `sources`.
   */
  lookup?: LookupTable | string;
  /**
   * Arbitrary transform (applied last), or the name of a registry /
   * built-in transform. With `sources`, it receives the positional array
   * of values and is required.
   */
  transform?: TransformFn | string;
  /** Value to use when the source(s) resolve to nothing. */
  default?: unknown;
  /** Keep only the first matched value (for a scalar target fed by an array source). */
  first?: boolean;
  /**
   * Apply this mapping only when the predicate returns truthy. For `source`
   * it is called per matched value (before cast/lookup/transform); for
   * `sources` it is called once with the positional values array. A falsy
   * return skips silently — never an error, even in strict mode.
   */
  when?: (value: any, input: unknown) => boolean;
}

/** A structured error for one mapping that could not be fully applied. */
export interface MappingError {
  /** Stable, documented error code — safe to branch on. */
  code: MappingErrorCode;
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
  /** Named transforms and lookup tables referenced by string in mappings. */
  registry?: Registry;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Label used for a mapping's source side in errors and `skipped`. */
function sourceLabel(mapping: Mapping): string | undefined {
  if (mapping.source !== undefined) return pathLabel(mapping.source);
  if (Array.isArray(mapping.sources)) return mapping.sources.map(pathLabel).join(" + ");
  return undefined;
}

function applyValueTransforms(mapping: Mapping, value: unknown, registry?: Registry): unknown {
  let next = value;
  if (mapping.lookup !== undefined) next = applyLookup(resolveLookup(mapping.lookup, registry), next);
  if (mapping.cast) next = applyCast(mapping.cast, next);
  if (mapping.transform !== undefined) next = resolveTransform(mapping.transform, registry)(next);
  return next;
}

function applyMultiSource(
  input: unknown,
  mapping: Mapping,
  result: Record<string, unknown>,
  errors: MappingError[],
  options: MapOptions,
  targetParts: string[]
): void {
  const fail = (code: MappingErrorCode, message: string): void => {
    errors.push({ code, source: sourceLabel(mapping), target: pathLabel(mapping.target), message });
  };

  if (!Array.isArray(mapping.sources) || mapping.sources.length === 0) {
    return fail("INVALID_MAPPING", "'sources' must be a non-empty array of paths");
  }
  if (mapping.transform === undefined) {
    return fail("INVALID_MAPPING", "'sources' requires a 'transform' function to combine the values");
  }
  if (mapping.lookup !== undefined) {
    return fail("INVALID_MAPPING", "'lookup' is not supported with 'sources'; do the lookup inside 'transform'");
  }

  const values: unknown[] = [];
  for (const path of mapping.sources) {
    const parts = parsePath(path);
    if (!parts) return fail("INVALID_MAPPING", `Malformed source path '${pathLabel(path)}'`);
    const found = extract(input, parts).filter((m) => m.value !== undefined);
    values.push(found.length > 0 ? found[0].value : undefined);
  }

  let value: unknown;
  if (values.every((v) => v === undefined)) {
    if (!("default" in mapping)) {
      if (options.strict) fail("SOURCE_MISSING", "All sources resolved to no values");
      return;
    }
    value = mapping.default; // Default is final: transform expects the values array.
  } else {
    if (mapping.when) {
      try {
        if (!mapping.when(values, input)) return;
      } catch (error) {
        return fail("TRANSFORM_FAILED", `'when' threw: ${errorMessage(error)}`);
      }
    }
    try {
      value = resolveTransform(mapping.transform, options.registry)(values);
    } catch (error) {
      return fail(codeOf(error, "TRANSFORM_FAILED"), errorMessage(error));
    }
  }

  try {
    if (mapping.cast) value = applyCast(mapping.cast, value);
    setValue(result, targetParts, value, []);
  } catch (error) {
    fail(codeOf(error, "TARGET_CONFLICT"), errorMessage(error));
  }
}

function applyMapping(
  input: unknown,
  mapping: Mapping,
  result: Record<string, unknown>,
  errors: MappingError[],
  options: MapOptions
): void {
  if (!mapping || typeof mapping !== "object") {
    errors.push({ code: "INVALID_MAPPING", message: "Mapping must be an object" });
    return;
  }

  const hasSource = mapping.source !== undefined;
  const hasSources = mapping.sources !== undefined;
  if (hasSource === hasSources) {
    errors.push({
      code: "INVALID_MAPPING",
      source: sourceLabel(mapping),
      target: mapping.target !== undefined ? pathLabel(mapping.target) : undefined,
      message: "Mapping must have exactly one of 'source' or 'sources'",
    });
    return;
  }

  const targetParts = mapping.target !== undefined ? parsePath(mapping.target) : null;
  if (!targetParts) {
    errors.push({
      code: "INVALID_MAPPING",
      source: sourceLabel(mapping),
      target: mapping.target !== undefined ? pathLabel(mapping.target) : undefined,
      message: "Malformed or missing target path",
    });
    return;
  }

  if (hasSources) {
    return applyMultiSource(input, mapping, result, errors, options, targetParts);
  }

  const label = { source: sourceLabel(mapping), target: pathLabel(mapping.target) };
  const push = (code: MappingErrorCode, message: string): void => {
    errors.push({ code, ...label, message });
  };

  const sourceParts = parsePath(mapping.source as Path);
  if (!sourceParts) {
    return push("INVALID_MAPPING", `Malformed source path '${label.source}'`);
  }

  const arrayLevels = targetParts.filter((part) => part === "$").length;

  let matches = extract(input, sourceParts).filter((m) => m.value !== undefined);

  if (matches.length === 0) {
    if ("default" in mapping) {
      matches = [{ value: mapping.default, path: [] }];
    } else {
      if (options.strict) {
        push("SOURCE_MISSING", `Source '${label.source}' resolved to no values`);
      }
      return; // Absent optional source: only an error in strict mode.
    }
  }

  if (mapping.when) {
    const kept: typeof matches = [];
    for (const match of matches) {
      try {
        if (mapping.when(match.value, input)) kept.push(match);
      } catch (error) {
        push("TRANSFORM_FAILED", `'when' threw: ${errorMessage(error)}`);
      }
    }
    matches = kept;
    if (matches.length === 0) return; // Skipped by predicate: silent by design.
  }

  if (mapping.first) {
    matches = matches.slice(0, 1);
  }

  if (arrayLevels === 0 && matches.length > 1) {
    push(
      "TARGET_CONFLICT",
      `Source resolved to ${matches.length} values but target is scalar; use first:true or a '$' target`
    );
    matches = matches.slice(0, 1);
  }

  for (const match of matches) {
    let value: unknown;
    try {
      value = applyValueTransforms(mapping, match.value, options.registry);
    } catch (error) {
      push(codeOf(error, "TRANSFORM_FAILED"), errorMessage(error));
      continue;
    }
    try {
      setValue(result, targetParts, value, match.path);
    } catch (error) {
      push(codeOf(error, "TARGET_CONFLICT"), errorMessage(error));
    }
  }
}

function computeSkipped(input: unknown, mappings: Mapping[]): string[] {
  const consumed = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping || typeof mapping !== "object") continue;
    const paths: Path[] = [];
    if (mapping.source !== undefined) paths.push(mapping.source);
    if (Array.isArray(mapping.sources)) paths.push(...mapping.sources);
    for (const path of paths) {
      const parts = parsePath(path);
      if (parts) consumed.add(parts.join("."));
    }
  }
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
    applyMapping(input, mapping, result, errors, options);
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
  parsePath,
  pathLabel,
  setValue,
  isUnsafeKey,
} from "./paths.js";
export {
  applyCast,
  applyLookup,
  resolveLookup,
  resolveTransform,
  BUILTIN_TRANSFORMS,
} from "./transform.js";
export { validateMappings } from "./validate.js";
export type { ValidationIssue, ValidationCode } from "./validate.js";
