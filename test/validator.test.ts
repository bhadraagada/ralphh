import { describe, test, expect } from "bun:test";
import {
  scoreValidation,
  formatFailureContext,
  type ValidationReport,
} from "../src/loop/validator.js";

describe("validator", () => {
  describe("scoreValidation", () => {
    test("returns 0 when all fail", () => {
      const report: ValidationReport = {
        allPassed: false,
        passCount: 0,
        totalCount: 3,
        results: [
          { command: "npm test", passed: false, stdout: "", stderr: "fail", exitCode: 1, duration: 100 },
          { command: "tsc", passed: false, stdout: "", stderr: "error", exitCode: 2, duration: 50 },
          { command: "lint", passed: false, stdout: "", stderr: "err", exitCode: 1, duration: 30 },
        ],
      };
      expect(scoreValidation(report)).toBe(0);
    });

    test("returns count of passing commands", () => {
      const report: ValidationReport = {
        allPassed: false,
        passCount: 2,
        totalCount: 3,
        results: [
          { command: "npm test", passed: true, stdout: "ok", stderr: "", exitCode: 0, duration: 100 },
          { command: "tsc", passed: true, stdout: "", stderr: "", exitCode: 0, duration: 50 },
          { command: "lint", passed: false, stdout: "", stderr: "err", exitCode: 1, duration: 30 },
        ],
      };
      expect(scoreValidation(report)).toBe(2);
    });

    test("returns total when all pass", () => {
      const report: ValidationReport = {
        allPassed: true,
        passCount: 3,
        totalCount: 3,
        results: [
          { command: "npm test", passed: true, stdout: "ok", stderr: "", exitCode: 0, duration: 100 },
          { command: "tsc", passed: true, stdout: "", stderr: "", exitCode: 0, duration: 50 },
          { command: "lint", passed: true, stdout: "", stderr: "", exitCode: 0, duration: 30 },
        ],
      };
      expect(scoreValidation(report)).toBe(3);
    });
  });

  describe("formatFailureContext", () => {
    test("returns empty string when all pass", () => {
      const report: ValidationReport = {
        allPassed: true,
        passCount: 1,
        totalCount: 1,
        results: [
          { command: "npm test", passed: true, stdout: "ok", stderr: "", exitCode: 0, duration: 100 },
        ],
      };
      expect(formatFailureContext(report, 4000)).toBe("");
    });

    test("includes failing command info", () => {
      const report: ValidationReport = {
        allPassed: false,
        passCount: 0,
        totalCount: 2,
        results: [
          {
            command: "npm test",
            passed: false,
            stdout: "",
            stderr: "TypeError: x is not a function",
            exitCode: 1,
            duration: 100,
          },
          {
            command: "tsc --noEmit",
            passed: true,
            stdout: "",
            stderr: "",
            exitCode: 0,
            duration: 50,
          },
        ],
      };
      const result = formatFailureContext(report, 4000);
      expect(result).toContain("npm test");
      expect(result).toContain("FAILED");
      expect(result).toContain("TypeError: x is not a function");
      expect(result).toContain("tsc --noEmit");
      expect(result).toContain("PASSED");
    });

    test("truncates long output", () => {
      const longError = "x".repeat(5000);
      const report: ValidationReport = {
        allPassed: false,
        passCount: 0,
        totalCount: 1,
        results: [
          {
            command: "npm test",
            passed: false,
            stdout: "",
            stderr: longError,
            exitCode: 1,
            duration: 100,
          },
        ],
      };
      const result = formatFailureContext(report, 500);
      expect(result.length).toBeLessThanOrEqual(520); // some tolerance for the truncation marker
      expect(result).toContain("...(truncated)");
    });

    test("prefers stderr over stdout for failure output", () => {
      const report: ValidationReport = {
        allPassed: false,
        passCount: 0,
        totalCount: 1,
        results: [
          {
            command: "npm test",
            passed: false,
            stdout: "stdout content",
            stderr: "stderr content",
            exitCode: 1,
            duration: 100,
          },
        ],
      };
      const result = formatFailureContext(report, 4000);
      expect(result).toContain("stderr content");
      // stderr is preferred, so stdout should NOT appear
      expect(result).not.toContain("stdout content");
    });

    test("falls back to stdout when stderr is empty", () => {
      const report: ValidationReport = {
        allPassed: false,
        passCount: 0,
        totalCount: 1,
        results: [
          {
            command: "npm test",
            passed: false,
            stdout: "FAIL: test suite failed",
            stderr: "",
            exitCode: 1,
            duration: 100,
          },
        ],
      };
      const result = formatFailureContext(report, 4000);
      expect(result).toContain("FAIL: test suite failed");
    });
  });
});
