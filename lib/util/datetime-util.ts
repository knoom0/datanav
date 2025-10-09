import { isValid, parseISO, isDate } from "date-fns";

// Date-fns format patterns for different granularities
export const DATE_FORMAT_PATTERNS = {
  TIME_ONLY: "h:mm a",
  DATE_WITH_TIME: "MMM d, h:mm a",
  DATE_WITH_YEAR: "MMM d, yyyy",
  DATE_ONLY: "MMM d",
} as const;

// Minimum timestamp for year 2000
const MIN_TIMESTAMP = new Date("2000-01-01").getTime();
// Maximum timestamp for year 2100
const MAX_TIMESTAMP = new Date("2100-01-01").getTime();

/**
 * Parses a value into a Date object if it's a valid datetime
 */
export function parseDateTime(value: any): Date | null {
  if (!value) return null;
  
  // Already a Date object
  if (isDate(value)) {
    return isValid(value) ? value : null;
  }
  
  // Try parsing string as ISO date
  if (typeof value === "string") {
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
    
    // Fallback to native Date parsing
    const nativeParsed = new Date(value);
    return isValid(nativeParsed) ? nativeParsed : null;
  }
  
  // Handle timestamps (milliseconds)
  if (typeof value === "number" && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP) {
    const date = new Date(value);
    return isValid(date) ? date : null;
  }
  
  return null;
}

/**
 * Determines the appropriate date format pattern based on data granularity
 */
export function determineBestDateTimeFormat(dates: Date[]): string {
  if (dates.length === 0) return DATE_FORMAT_PATTERNS.DATE_WITH_YEAR;
  
  const hasMultipleYears = new Set(dates.map(d => d.getFullYear())).size > 1;
  const hasTimeComponent = dates.some(d => d.getHours() !== 0 || d.getMinutes() !== 0);
  
  // Check if all dates are on the same day
  const sameDayDates = dates.every(d => 
    d.getFullYear() === dates[0].getFullYear() &&
    d.getMonth() === dates[0].getMonth() &&
    d.getDate() === dates[0].getDate()
  );
  
  if (sameDayDates && hasTimeComponent) {
    return DATE_FORMAT_PATTERNS.TIME_ONLY;
  }
  
  if (hasTimeComponent) {
    return DATE_FORMAT_PATTERNS.DATE_WITH_TIME;
  }
  
  if (hasMultipleYears) {
    return DATE_FORMAT_PATTERNS.DATE_WITH_YEAR;
  }
  
  return DATE_FORMAT_PATTERNS.DATE_ONLY;
}

