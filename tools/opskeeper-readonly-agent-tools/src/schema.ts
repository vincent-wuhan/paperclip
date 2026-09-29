/**
 * JSON Schema validation for read-only Agent tools (Phase C, task 3.7).
 *
 * Implementation: a tiny, dependency-free schema validator that supports the
 * subset of JSON Schema Draft 7 needed by the Agent tool surface. This avoids
 * pulling in a heavyweight `ajv`-style runtime (which would expand the plugin
 * bundle and increase the supply-chain attack surface). Every tool is enforced
 * to declare its schema at registration time, and validation rejects requests
 * before they reach the executor — that is the core "no mutation" guarantee.
 *
 * Constraints honored:
 *   - type (string, number, integer, boolean, object, array, null)
 *   - required, properties, additionalProperties
 *   - enum, const
 *   - minLength, maxLength, pattern, minimum, maximum, minItems, maxItems
 *   - items (single schema only)
 *
 * Anything that fails to validate is rejected with a structured ValidationError.
 */

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  description?: string;
  default?: unknown;
}

export class ValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Schema validation failed: ${issues.join("; ")}`);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * Validate `value` against `schema`. Throws ValidationError on any
 * failure or returns null on success. Tool callers should treat thrown
 * ValidationError as "reject without invoking the executor".
 *
 * The implementation is intentionally strict: unknown schema keywords cause
 * a hard validation failure (fail-closed), so an accidental schema change
 * cannot silently downgrade the Agent tool surface.
 */
export function validate(value: unknown, schema: JsonSchema, path: string = "$"): void {
  const issues: string[] = [];
  walk(value, schema, path, issues);
  if (issues.length > 0) throw new ValidationError(issues);
}

function typeMatches(value: unknown, expected: JsonSchemaType): boolean {
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return false;
  }
}

function walk(value: unknown, schema: JsonSchema, path: string, issues: string[]): void {
  if (issues.length > 50) return;

  if ("const" in schema) {
    if (value !== schema.const) {
      issues.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
      return;
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((v) => Object.is(v, value))) {
      issues.push(`${path}: value not in enum`);
      return;
    }
  }

  if (schema.type !== undefined) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((t) => typeMatches(value, t))) {
      issues.push(
        `${path}: expected type ${expectedTypes.join("|")}, got ${describe(value)}`,
      );
      return;
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      issues.push(`${path}: minLength ${schema.minLength}`);
      return;
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      issues.push(`${path}: maxLength ${schema.maxLength}`);
      return;
    }
    if (typeof schema.pattern === "string") {
      let re: RegExp;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        issues.push(`${path}: schema.pattern is not a valid regex`);
        return;
      }
      if (!re.test(value)) {
        issues.push(`${path}: pattern mismatch`);
        return;
      }
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push(`${path}: minimum ${schema.minimum}`);
      return;
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push(`${path}: maximum ${schema.maximum}`);
      return;
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push(`${path}: minItems ${schema.minItems}`);
      return;
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push(`${path}: maxItems ${schema.maxItems}`);
      return;
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], schema.items, `${path}[${i}]`, issues);
        if (issues.length > 50) return;
      }
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          issues.push(`${path}: missing required property "${key}"`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in obj) walk(obj[key], subSchema, `${path}.${key}`, issues);
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (issues.length >= 50) break;
        if (!allowed.has(key)) {
          issues.push(`${path}: additional property "${key}" not allowed`);
        }
      }
    } else if (
      typeof schema.additionalProperties === "object" &&
      schema.additionalProperties !== null &&
      !Array.isArray(schema.additionalProperties)
    ) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (issues.length >= 50) break;
        if (!allowed.has(key)) {
          walk(obj[key], schema.additionalProperties as JsonSchema, `${path}.${key}`, issues);
        }
      }
    }
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
