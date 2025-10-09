import { inspect } from "util";

import sharp from "sharp";

export const DEFAULT_MAX_INPUT_IMAGE_AREA = 480000;

const INSPECT_OPTIONS = {
  depth: 3,
  maxStringLength: 300,
  maxArrayLength: 10,
  colors: false,
  compact: false,
  breakLength: 80
} as const;

/**
 * Helper function to write content to console with proper formatting for objects.
 * Uses util.inspect for objects with truncation for long strings.
 * @param content - The content to write (string or object)
 */
export function logToConsole(content: string | object): void {
  if (typeof content === "string") {
    process.stdout.write(content);
  } else {
    // Use util.inspect for objects with truncation for long strings
    const formatted = inspect(content, INSPECT_OPTIONS);
    process.stdout.write(formatted);
  }
}

/**
 * Generates a date within the current month for the specified day number.
 * Useful for creating dynamic sample data that stays current.
 * 
 * @param dayNumber - Day number of the month (1-31, defaults to 1)
 * @returns Date string in YYYY-MM-DD format
 * 
 * @example
 * generateCurrentMonthDate(1)   // 1st of current month
 * generateCurrentMonthDate(15)  // 15th of current month
 * generateCurrentMonthDate(31)  // 31st of current month (or last day if month has fewer days)
 */
export function generateCurrentMonthDate(dayNumber: number = 1): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Get the last day of current month
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Clamp the day number to be within the current month
  let targetDay = dayNumber;
  if (targetDay < 1) {
    targetDay = 1;
  } else if (targetDay > lastDayOfMonth) {
    targetDay = lastDayOfMonth;
  }
  
  const targetDate = new Date(currentYear, currentMonth, targetDay);
  return targetDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
}

/**
 * Generates a datetime string within the current month for the specified day number.
 * Similar to generateCurrentMonthDate but returns ISO datetime format.
 * 
 * @param dayNumber - Day number of the month (1-31, defaults to 1)
 * @param hour - Hour of day (0-23, defaults to 0)
 * @returns Datetime string in ISO format (YYYY-MM-DDTHH:MM:SSZ)
 */
export function generateCurrentMonthDateTime(dayNumber: number = 1, hour: number = 0): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Get the last day of current month
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Clamp the day number to be within the current month
  let targetDay = dayNumber;
  if (targetDay < 1) {
    targetDay = 1;
  } else if (targetDay > lastDayOfMonth) {
    targetDay = lastDayOfMonth;
  }
  
  const targetDate = new Date(currentYear, currentMonth, targetDay, hour, 0, 0);
  return targetDate.toISOString();
}


/**
 * Resizes an image by a given rate while maintaining aspect ratio.
 * Supports various input formats including Buffer, file path, and base64 data URLs.
 * 
 * @param input - Image input (Buffer, file path string, or base64 data URL)
 * @param rate - Resize rate (0.1 to 10.0, where 1.0 = original size, 0.5 = half size, 2.0 = double size)
 * @param outputFormat - Output format ("png" | "jpeg" | "webp", defaults to "png")
 * @returns Promise resolving to resized image as Buffer
 * 
 * @example
 * // Resize to 50% of original size
 * const resizedBuffer = await resizeImage("/path/to/image.jpg", 0.5);
 * 
 * // Resize from base64 data URL
 * const resizedBuffer = await resizeImage("data:image/png;base64,iVBOR...", 0.8);
 * 
 * // Resize buffer and output as JPEG
 * const resizedBuffer = await resizeImage(imageBuffer, 1.5, "jpeg");
 */
export async function resizeImage(
  input: Buffer | string,
  rate: number,
  outputFormat: "png" | "jpeg" | "webp" = "png"
): Promise<Buffer> {
  // Validate rate parameter
  if (rate <= 0 || rate > 10) {
    throw new Error("Resize rate must be between 0.1 and 10.0");
  }

  let imageBuffer: Buffer;

  // Handle different input types
  if (Buffer.isBuffer(input)) {
    imageBuffer = input;
  } else if (typeof input === "string") {
    if (input.startsWith("data:image/")) {
      // Handle base64 data URL
      const base64Data = input.split(",")[1];
      if (!base64Data) {
        throw new Error("Invalid base64 data URL format");
      }
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      // Handle file path
      const fs = await import("fs");
      imageBuffer = fs.readFileSync(input);
    }
  } else {
    throw new Error("Input must be a Buffer, file path string, or base64 data URL");
  }

  // Get original dimensions
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions");
  }

  // Calculate new dimensions
  const newWidth = Math.round(metadata.width * rate);
  const newHeight = Math.round(metadata.height * rate);

  // Resize and convert to specified format
  const sharpInstance = sharp(imageBuffer).resize(newWidth, newHeight);
  
  switch (outputFormat) {
  case "jpeg":
    return sharpInstance.jpeg().toBuffer();
  case "webp":
    return sharpInstance.webp().toBuffer();
  case "png":
  default:
    return sharpInstance.png().toBuffer();
  }
}


/**
 * Converts an image to an appropriate format for model input by resizing if needed.
 * If the image area (width × height) exceeds the maximum allowed area, it will be
 * resized proportionally to fit within the limit while maintaining aspect ratio.
 * 
 * @param params - Configuration object
 * @param params.image - Image input as Buffer or base64 encoded string (without data URL prefix)
 * @param params.maxImageArea - Maximum allowed image area (width × height, defaults to DEFAULT_MAX_INPUT_IMAGE_AREA)
 * @returns Promise resolving to resized image as Buffer
 * 
 * @example
 * // Resize image from base64 string
 * const imageBuffer = await toModelInputImage({ image: base64String });
 * 
 * // Resize image from Buffer
 * const imageBuffer = await toModelInputImage({ image: bufferData });
 * 
 * // Use custom size limit
 * const imageBuffer = await toModelInputImage({ 
 *   image: base64String, 
 *   maxImageArea: 1000000 
 * });
 */
export async function toModelInputImage({
  image,
  maxImageArea = DEFAULT_MAX_INPUT_IMAGE_AREA
}: {
  image: Buffer | string;
  maxImageArea?: number;
}): Promise<Buffer> {
  // Convert input to Buffer if it"s a base64 string
  const imageBuffer = Buffer.isBuffer(image) ? image : Buffer.from(image, "base64");
  
  // Get the width and height of the image
  const metadata = await sharp(imageBuffer).metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions from image data");
  }
  
  const area = metadata.width * metadata.height;
  
  if (area > maxImageArea) {
    // Calculate resize rate to fit within the maximum area
    const resizeRate = maxImageArea / area;
    
    // Use the buffer directly for resizing instead of converting back to base64
    return await resizeImage(imageBuffer, resizeRate);
  }
  
  return imageBuffer;
}
