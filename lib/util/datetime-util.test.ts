import { isValid } from "date-fns";
import { describe, it, expect } from "vitest";

import {
  parseDateTime,
  determineBestDateTimeFormat,
  DATE_FORMAT_PATTERNS,
} from "@/lib/util/datetime-util";

describe("DateTime Utilities", () => {
  describe("parseDateTime", () => {
    it("should parse ISO datetime strings", () => {
      const result = parseDateTime("2023-10-09T12:00:00");
      expect(result).toBeInstanceOf(Date);
      expect(isValid(result!)).toBe(true);
    });

    it("should parse ISO date strings", () => {
      const result = parseDateTime("2023-10-09");
      expect(result).toBeInstanceOf(Date);
      expect(isValid(result!)).toBe(true);
    });

    it("should return null for non-datetime strings", () => {
      expect(parseDateTime("hello")).toBe(null);
      expect(parseDateTime("not a date")).toBe(null);
    });

    it("should handle Date objects", () => {
      const date = new Date("2023-10-09");
      const result = parseDateTime(date);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(date.getTime());
    });

    it("should return null for invalid Date objects", () => {
      const invalidDate = new Date("invalid");
      expect(parseDateTime(invalidDate)).toBe(null);
    });
  });

  describe("determineBestDateTimeFormat", () => {
    it("should use TIME_ONLY for same-day dates with time", () => {
      const dates = [
        new Date("2023-10-09T10:00:00"),
        new Date("2023-10-09T14:00:00"),
        new Date("2023-10-09T18:00:00"),
      ];
      const pattern = determineBestDateTimeFormat(dates);
      expect(pattern).toBe(DATE_FORMAT_PATTERNS.TIME_ONLY);
    });

    it("should use DATE_WITH_YEAR for multi-year dates", () => {
      const dates = [
        new Date("2022-01-01T00:00:00"),
        new Date("2023-01-01T00:00:00"),
        new Date("2024-01-01T00:00:00"),
      ];
      const pattern = determineBestDateTimeFormat(dates);
      expect(pattern).toBe(DATE_FORMAT_PATTERNS.DATE_WITH_YEAR);
    });

    it("should use DATE_ONLY for same-year dates without time", () => {
      const dates = [
        new Date("2023-01-01T00:00:00"),
        new Date("2023-02-01T00:00:00"),
        new Date("2023-03-01T00:00:00"),
      ];
      const pattern = determineBestDateTimeFormat(dates);
      expect(pattern).toBe(DATE_FORMAT_PATTERNS.DATE_ONLY);
    });

    it("should use DATE_WITH_TIME for dates with time component", () => {
      const dates = [
        new Date("2023-01-01T10:00:00"),
        new Date("2023-01-02T14:00:00"),
        new Date("2023-01-03T18:00:00"),
      ];
      const pattern = determineBestDateTimeFormat(dates);
      expect(pattern).toBe(DATE_FORMAT_PATTERNS.DATE_WITH_TIME);
    });
  });
});

