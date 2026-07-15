/**
 * Stable error codes. These are public API: documented in the README,
 * covered by tests, and never renamed within a major version.
 */
export type MappingErrorCode =
  | "SOURCE_MISSING"
  | "CAST_FAILED"
  | "LOOKUP_MISS"
  | "TARGET_CONFLICT"
  | "UNSAFE_TARGET"
  | "TRANSFORM_FAILED"
  | "INVALID_MAPPING";

/** Internal: an Error carrying a {@link MappingErrorCode}. */
export class CodedError extends Error {
  constructor(
    public readonly code: MappingErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CodedError";
  }
}

/** Extract the code from a thrown value, with a fallback for foreign errors. */
export function codeOf(error: unknown, fallback: MappingErrorCode): MappingErrorCode {
  return error instanceof CodedError ? error.code : fallback;
}
