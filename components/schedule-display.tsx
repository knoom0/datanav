import { Text } from "@mantine/core";

interface ScheduleDisplayProps {
  cron: string;
  timezone?: string;
}

/**
 * Converts a cron expression to a human-readable format
 */
function cronToHumanReadable(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) {
    return cron; // Return original if format is unexpected
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Hourly pattern: * * * * (hour is * or */N)
  if (hour === "*" || hour.startsWith("*/")) {
    const minuteNum = parseInt(minute, 10);
    const displayMinute = minuteNum.toString().padStart(2, "0");
    
    if (hour === "*") {
      return `Every hour at :${displayMinute}`;
    } else {
      const interval = parseInt(hour.substring(2), 10);
      if (interval === 1) {
        return `Every hour at :${displayMinute}`;
      } else {
        return `Every ${interval} hours at :${displayMinute}`;
      }
    }
  }

  // Helper to format time
  const formatTime = (h: string, m: string): string => {
    const hourNum = parseInt(h, 10);
    const minuteNum = parseInt(m, 10);
    const period = hourNum >= 12 ? "PM" : "AM";
    const displayHour = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
    const displayMinute = minuteNum.toString().padStart(2, "0");
    return `${displayHour}:${displayMinute} ${period}`;
  };

  const time = formatTime(hour, minute);

  // Daily pattern: * * * (every day)
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${time}`;
  }

  // Weekly pattern: * * [days]
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const days = dayOfWeek.split(",").map((d) => {
      const dayNum = parseInt(d.trim(), 10);
      return dayNames[dayNum] || d;
    });

    if (days.length === 7) {
      return `Daily at ${time}`;
    } else if (days.length === 5 && !days.includes("Saturday") && !days.includes("Sunday")) {
      return `Weekdays at ${time}`;
    } else if (days.length === 1) {
      return `Every ${days[0]} at ${time}`;
    } else {
      return `Every ${days.join(", ")} at ${time}`;
    }
  }

  // Monthly pattern: [day] * *
  if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    const day = parseInt(dayOfMonth, 10);
    // Get ordinal suffix (handles 1st, 2nd, 3rd, 21st, 22nd, 23rd, 31st, etc.)
    const getOrdinalSuffix = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return s[(v - 20) % 10] || s[v] || s[0];
    };
    const suffix = getOrdinalSuffix(day);
    return `Monthly on the ${day}${suffix} at ${time}`;
  }

  // Default: return original cron if pattern doesn't match
  return cron;
}

export function ScheduleDisplay({ cron, timezone }: ScheduleDisplayProps) {
  const humanReadable = cronToHumanReadable(cron);

  return (
    <>
      <Text span fw={500}>{humanReadable}</Text>
      {timezone && (
        <Text span c="dimmed"> ({timezone})</Text>
      )}
    </>
  );
}

