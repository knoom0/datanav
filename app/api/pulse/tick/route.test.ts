import { CronExpressionParser } from "cron-parser";
import { describe, it, expect } from "vitest";

describe("cron-parser integration", () => {
  it("should parse simple hourly schedule", () => {
    const fromDate = new Date("2025-01-15T10:30:00Z");
    const cronExpression = "0 * * * *"; // hourly
    
    const expression = CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
      tz: "UTC"
    });
    
    const nextRun = expression.next().toDate();
    expect(nextRun.toISOString()).toBe("2025-01-15T11:00:00.000Z");
  });

  it("should parse daily schedule", () => {
    const fromDate = new Date("2025-01-15T10:30:00Z");
    const cronExpression = "0 0 * * *"; // daily at midnight
    
    const expression = CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
      tz: "UTC"
    });
    
    const nextRun = expression.next().toDate();
    expect(nextRun.toISOString()).toBe("2025-01-16T00:00:00.000Z");
  });

  it("should handle timezone conversion", () => {
    const fromDate = new Date("2025-01-15T10:30:00Z");
    const cronExpression = "0 9 * * *"; // 9 AM
    
    const expression = CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
      tz: "America/New_York"
    });
    
    const nextRun = expression.next().toDate();
    // 9 AM EST is 14:00 UTC (EST is UTC-5)
    expect(nextRun.toISOString()).toBe("2025-01-15T14:00:00.000Z");
  });

  it("should parse complex cron expression", () => {
    const fromDate = new Date("2025-01-15T08:00:00Z"); // Wednesday
    const cronExpression = "0 9 * * 1-5"; // 9 AM on weekdays
    
    const expression = CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
      tz: "UTC"
    });
    
    const nextRun = expression.next().toDate();
    expect(nextRun.toISOString()).toBe("2025-01-15T09:00:00.000Z"); // Same day (Wednesday)
  });

  it("should parse every 15 minutes", () => {
    const fromDate = new Date("2025-01-15T10:05:00Z");
    const cronExpression = "*/15 * * * *";
    
    const expression = CronExpressionParser.parse(cronExpression, {
      currentDate: fromDate,
      tz: "UTC"
    });
    
    const nextRun = expression.next().toDate();
    expect(nextRun.toISOString()).toBe("2025-01-15T10:15:00.000Z");
  });
});

