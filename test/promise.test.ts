import { describe, test, expect } from "bun:test";
import { generatePromise, detectPromise } from "../src/loop/promise.js";

describe("promise", () => {
  test("generatePromise returns a RALPH_COMPLETE_ prefixed string", () => {
    const p = generatePromise();
    expect(p).toMatch(/^RALPH_COMPLETE_[0-9a-f]{8}$/);
  });

  test("generatePromise returns unique values each call", () => {
    const a = generatePromise();
    const b = generatePromise();
    expect(a).not.toBe(b);
  });

  test("detectPromise finds the promise in output", () => {
    const promise = "RALPH_COMPLETE_abcd1234";
    const output = `
I've fixed all the tests. Everything is passing now.

RALPH_COMPLETE_abcd1234
`;
    expect(detectPromise(output, promise)).toBe(true);
  });

  test("detectPromise returns false for missing promise", () => {
    const promise = "RALPH_COMPLETE_abcd1234";
    const output = "I'm done with the changes but tests still fail.";
    expect(detectPromise(output, promise)).toBe(false);
  });

  test("detectPromise returns false for partial match", () => {
    const promise = "RALPH_COMPLETE_abcd1234";
    const output = "RALPH_COMPLETE_xxxx9999";
    expect(detectPromise(output, promise)).toBe(false);
  });

  test("detectPromise works when promise is embedded in other text", () => {
    const promise = "RALPH_COMPLETE_abcd1234";
    const output = "Some text RALPH_COMPLETE_abcd1234 more text";
    expect(detectPromise(output, promise)).toBe(true);
  });
});
