import { inspect } from "util";

const INSPECT_OPTIONS = {
  depth: 3,
  maxStringLength: 300,
  maxArrayLength: 10,
  colors: false,
  compact: false,
  breakLength: 80
} as const;

/**
 * Safely converts any error to a formatted string with consistent display.
 * Handles Error objects, strings, objects, and other types gracefully.
 * Truncates overly long messages and includes stack trace info when helpful.
 * 
 * @param error - The error to format (can be any type)
 * @param maxLength - Maximum length of the returned string (default: 500)
 * @returns A safely formatted error string
 * 
 * @example
 * safeErrorString(new Error("Something went wrong"))
 * safeErrorString({ code: 500, message: "Server error" })
 * safeErrorString("Simple error message")
 */
export function safeErrorString(error: any, maxLength: number = 500): string {
  if (error === null || error === undefined) {
    return "Unknown error occurred";
  }
  
  let message: string;
  
  if (error instanceof Error) {
    // For Error objects, use the message and optionally include stack trace info
    message = error.message;
    if (error.stack && message.length < maxLength / 2) {
      // Include first line of stack trace if message is short
      const stackFirstLine = error.stack.split("\n")[1]?.trim();
      if (stackFirstLine) {
        message += ` (${stackFirstLine})`;
      }
    }
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object") {
    // Use util.inspect for objects with the same truncation logic as logToConsole
    message = inspect(error, INSPECT_OPTIONS);
  } else {
    message = String(error);
  }
  
  // Truncate if too long
  if (message.length > maxLength) {
    message = message.substring(0, maxLength - 3) + "...";
  }
  
  return message;
}
