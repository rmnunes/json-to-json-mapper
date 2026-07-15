/**
 * Static validation of mapping definitions — the piece that makes stored
 * (JSON) mappings safe to deploy: run this in CI or before persisting, and
 * zero issues means `map` will not produce INVALID_MAPPING/UNSAFE_TARGET
 * errors for these definitions.
 */

import type { MappingErrorCode } from "./errors.js";
import { isUnsafeKey, parsePath, type Path } from "./paths.js";
import { BUILTIN_TRANSFORMS, castName, type Cast, type Registry } from "./transform.js";
import type { Mapping } from "./index.js";

export type ValidationCode = MappingErrorCode | "UNKNOWN_KEY";

/** One problem found in a mapping definition. */
export interface ValidationIssue {
  /** Index of the offending mapping in the array (-1 for the array itself). */
  index: number;
  code: ValidationCode;
  /** The mapping field the issue concerns, when attributable. */
  field?: string;
  message: string;
}

const KNOWN_KEYS = new Set([
  "source",
  "sources",
  "target",
  "cast",
  "lookup",
  "transform",
  "default",
  "first",
  "when",
]);

function checkPath(
  issues: ValidationIssue[],
  index: number,
  field: string,
  path: unknown,
  isTarget: boolean
): void {
  const parts = parsePath(path as Path);
  if (!parts) {
    issues.push({
      index,
      code: "INVALID_MAPPING",
      field,
      message: `Malformed ${field} path '${typeof path === "object" ? JSON.stringify(path) : String(path)}'`,
    });
    return;
  }
  if (isTarget) {
    for (const part of parts) {
      if (isUnsafeKey(part)) {
        issues.push({
          index,
          code: "UNSAFE_TARGET",
          field,
          message: `Target segment '${part}' would be rejected at map time (prototype pollution guard)`,
        });
      }
    }
  }
}

export interface ValidateOptions {
  /** Registry that string `transform` / `lookup` references will be resolved against. */
  registry?: Registry;
}

/**
 * Validate mapping definitions without running them. Returns structured
 * issues (never throws for content problems). An empty array means the
 * definitions are safe to persist and will not produce INVALID_MAPPING or
 * UNSAFE_TARGET errors at map time.
 */
export function validateMappings(
  mappings: unknown,
  options: ValidateOptions = {}
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(mappings)) {
    return [{ index: -1, code: "INVALID_MAPPING", message: "mappings must be an array" }];
  }

  mappings.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ index, code: "INVALID_MAPPING", message: "Mapping must be an object" });
      return;
    }
    const mapping = raw as Record<string, unknown> & Mapping;

    for (const key of Object.keys(mapping)) {
      if (!KNOWN_KEYS.has(key)) {
        issues.push({
          index,
          code: "UNKNOWN_KEY",
          field: key,
          message: `Unknown mapping key '${key}' (typo?)`,
        });
      }
    }

    const hasSource = mapping.source !== undefined;
    const hasSources = mapping.sources !== undefined;
    if (hasSource === hasSources) {
      issues.push({
        index,
        code: "INVALID_MAPPING",
        message: "Mapping must have exactly one of 'source' or 'sources'",
      });
    }

    if (hasSource) checkPath(issues, index, "source", mapping.source, false);
    if (hasSources) {
      if (!Array.isArray(mapping.sources) || mapping.sources.length === 0) {
        issues.push({
          index,
          code: "INVALID_MAPPING",
          field: "sources",
          message: "'sources' must be a non-empty array of paths",
        });
      } else {
        mapping.sources.forEach((path, i) =>
          checkPath(issues, index, `sources[${i}]`, path, false)
        );
        if (mapping.transform === undefined) {
          issues.push({
            index,
            code: "INVALID_MAPPING",
            field: "transform",
            message: "'sources' requires a 'transform'",
          });
        }
        if (mapping.lookup !== undefined) {
          issues.push({
            index,
            code: "INVALID_MAPPING",
            field: "lookup",
            message: "'lookup' is not supported with 'sources'",
          });
        }
      }
    }

    if (mapping.target === undefined) {
      issues.push({ index, code: "INVALID_MAPPING", field: "target", message: "Missing 'target'" });
    } else {
      checkPath(issues, index, "target", mapping.target, true);
    }

    if (mapping.cast !== undefined) {
      try {
        castName(mapping.cast as Cast);
      } catch {
        issues.push({
          index,
          code: "INVALID_MAPPING",
          field: "cast",
          message: `Unsupported cast '${String(mapping.cast)}' (use "string" | "number" | "boolean")`,
        });
      }
    }

    if (typeof mapping.transform === "string") {
      const known =
        options.registry?.transforms?.[mapping.transform] ?? BUILTIN_TRANSFORMS[mapping.transform];
      if (typeof known !== "function") {
        issues.push({
          index,
          code: "INVALID_MAPPING",
          field: "transform",
          message: `Unknown transform '${mapping.transform}' (not in registry or built-ins)`,
        });
      }
    } else if (mapping.transform !== undefined && typeof mapping.transform !== "function") {
      issues.push({
        index,
        code: "INVALID_MAPPING",
        field: "transform",
        message: "'transform' must be a function or a registry name",
      });
    }

    if (typeof mapping.lookup === "string") {
      if (options.registry?.lookups?.[mapping.lookup] === undefined) {
        issues.push({
          index,
          code: "INVALID_MAPPING",
          field: "lookup",
          message: `Unknown lookup '${mapping.lookup}' (not in registry)`,
        });
      }
    } else if (
      mapping.lookup !== undefined &&
      (typeof mapping.lookup !== "object" || mapping.lookup === null || Array.isArray(mapping.lookup))
    ) {
      issues.push({
        index,
        code: "INVALID_MAPPING",
        field: "lookup",
        message: "'lookup' must be an object table or a registry name",
      });
    }

    if (mapping.when !== undefined && typeof mapping.when !== "function") {
      issues.push({
        index,
        code: "INVALID_MAPPING",
        field: "when",
        message: "'when' must be a function",
      });
    }
    if (mapping.first !== undefined && typeof mapping.first !== "boolean") {
      issues.push({
        index,
        code: "INVALID_MAPPING",
        field: "first",
        message: "'first' must be a boolean",
      });
    }
  });

  return issues;
}
