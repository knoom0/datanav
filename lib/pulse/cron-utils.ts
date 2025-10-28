import { CronExpressionParser } from "cron-parser";

export type ScheduleFrequency = "hourly" | "daily" | "weekly" | "monthly";

export interface ScheduleComponents {
  frequency: ScheduleFrequency;
  interval?: number;
  selectedDays?: number[];
  hour?: number;
  minute: number;
}

/**
 * Generates a cron expression from schedule components
 */
export function generateCronExpression(params: ScheduleComponents): string {
  const { frequency, interval = 1, selectedDays = [1], hour = 9, minute } = params;

  if (frequency === "hourly") {
    // Hourly: every N hours at specified minute
    if (interval === 1) {
      return `${minute} * * * *`;
    } else {
      return `${minute} */${interval} * * *`;
    }
  } else if (frequency === "daily") {
    // Daily: every day at specified time
    return `${minute} ${hour} * * *`;
  } else if (frequency === "weekly") {
    // Weekly: on selected days at specified time
    const days = selectedDays.sort().join(",");
    return `${minute} ${hour} * * ${days}`;
  } else if (frequency === "monthly") {
    // Monthly: on the 1st of every month at specified time
    return `${minute} ${hour} 1 * *`;
  }
  
  // Default to daily
  return `${minute} ${hour} * * *`;
}

/**
 * Parses a cron expression into schedule components
 */
export function parseCronExpression(cron: string): ScheduleComponents {
  const parts = cron.split(" ");
  if (parts.length !== 5) {
    // Return default if format is unexpected
    return {
      frequency: "weekly",
      interval: 1,
      selectedDays: [1],
      hour: 9,
      minute: 0
    };
  }

  const [minutePart, hourPart, , , dayOfWeekPart] = parts;
  
  // Parse minute
  const minute = parseInt(minutePart, 10) || 0;
  
  // Check if hourly (hour part has * or */N)
  if (hourPart === "*" || hourPart.startsWith("*/")) {
    if (hourPart.startsWith("*/")) {
      const interval = parseInt(hourPart.substring(2), 10);
      return { frequency: "hourly", interval: interval || 1, minute };
    } else {
      return { frequency: "hourly", interval: 1, minute };
    }
  }
  
  // Parse hour for non-hourly frequencies
  const hour = parseInt(hourPart, 10) || 9;
  
  // Determine frequency based on day of week part
  if (dayOfWeekPart === "*") {
    // Daily
    return { frequency: "daily", hour, minute };
  } else if (dayOfWeekPart.includes(",")) {
    // Weekly with specific days
    const selectedDays = dayOfWeekPart.split(",").map(d => parseInt(d, 10));
    return { frequency: "weekly", hour, minute, selectedDays };
  } else if (!isNaN(parseInt(dayOfWeekPart, 10))) {
    // Weekly with single day
    return { frequency: "weekly", hour, minute, selectedDays: [parseInt(dayOfWeekPart, 10)] };
  }
  
  // Default to weekly
  return {
    frequency: "weekly",
    interval: 1,
    selectedDays: [1],
    hour,
    minute
  };
}

/**
 * Calculates the next run time for a pulse based on its cron expression
 */
export function calculateNextRunTime(params: {
  cron: string;
  cronTimezone?: string | null;
  fromDate?: Date;
}): Date {
  const { cron, cronTimezone = "UTC", fromDate = new Date() } = params;

  // Parse the cron expression
  const expression = CronExpressionParser.parse(cron, {
    currentDate: fromDate,
    tz: cronTimezone || "UTC"
  });

  // Get the next occurrence
  return expression.next().toDate();
}

