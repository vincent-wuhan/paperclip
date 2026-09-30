import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, ValidationError } from "../src/schema.ts";

test("validate: accepts string with minLength/maxLength", () => {
  validate("ok", { type: "string", minLength: 1, maxLength: 5 });
});

test("validate: rejects string below minLength", () => {
  assert.throws(() => validate("", { type: "string", minLength: 1 }), ValidationError);
});

test("validate: enforces pattern", () => {
  validate("abc-123", { type: "string", pattern: "^[a-zA-Z0-9_.\\-:]+$" });
  assert.throws(
    () => validate("abc!123", { type: "string", pattern: "^[a-zA-Z0-9_.\\-:]+$" }),
    ValidationError,
  );
});

test("validate: enumerates required and rejects extras", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: { type: "string" } },
  };
  validate({ id: "x" }, schema);
  assert.throws(() => validate({}, schema), ValidationError);
  assert.throws(() => validate({ id: "x", extra: 1 }, schema), ValidationError);
});

test("validate: caps issue list to prevent unbounded error responses", () => {
  const obj = {};
  for (let i = 0; i < 100; i++) obj[`k${i}`] = i;
  let caught: ValidationError | null = null;
  try {
    validate(obj, { type: "object", additionalProperties: false, properties: {} });
  } catch (e) {
    caught = e as ValidationError;
  }
  assert.ok(caught !== null, "expected throw");
  assert.ok(caught!.issues.length <= 50, "issue list capped");
});
