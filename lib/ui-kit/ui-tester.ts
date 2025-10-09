import { chromium } from "playwright";

import logger from "@/lib/logger";
import { UIBundle } from "@/lib/types";
import { UIBundleError } from "@/lib/ui-kit/ui-bundle";

/**
 * Detects the current server URL based on environment and runtime context
 * @returns The base URL for the preview server
 */
function getPreviewServerUrl(): string {
  // Check for explicit environment variable first
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  
  // In development, check if we can determine the port from Next.js
  if (process.env.NODE_ENV === "development") {
    // Try to detect port from PORT environment variable
    const port = process.env.PORT || "3000";
    return `http://localhost:${port}`;
  }
  
  // In production, try to construct URL from headers if available
  // This requires the function to be called from a request context
  if (typeof global !== "undefined" && (global as any).__NEXT_REQUEST_URL__) {
    const url = new URL((global as any).__NEXT_REQUEST_URL__);
    return `${url.protocol}//${url.host}`;
  }
  
  // Fallback to localhost:3000 for development
  return "http://localhost:3000";
}

/**
 * The preview server URL determined at module load time.
 * This is a constant for the lifetime of the process.
 */
const PREVIEW_SERVER_URL = getPreviewServerUrl();

/**
 * Checks if the preview is available, throwing an error if not
 * @param timeoutMs Timeout in milliseconds for the availability check (defaults to 5000ms)
 * @throws Error if the preview is not available
 */
export async function checkPreviewAvailability(
  timeoutMs: number = 10000
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(`${PREVIEW_SERVER_URL}/preview`, {
      method: "HEAD",
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Preview server is not available at ${PREVIEW_SERVER_URL}. Please ensure the Next.js development server is running`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Preview server is not available")) {
      throw error;
    }
    throw new Error(`Preview server is not available at ${PREVIEW_SERVER_URL}. Please ensure the Next.js development server is running`);
  }
}

interface PreviewOptions {
  width?: number;
  height?: number;
  scale?: number;
  backgroundColor?: string;
}

const defaultOptions: PreviewOptions = {
  width: 480,
  height: 800,
  scale: 1,
  backgroundColor: "white"
};

export async function previewUI(
  spec: UIBundle,
  options: PreviewOptions = {}
): Promise<Buffer> {
  const mergedOptions = { ...defaultOptions, ...options };
  const previewUrl = `${PREVIEW_SERVER_URL}/preview`;
  
  // Launch Playwright browser
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages: { type: string; text: string }[] = [];
  page.on("console", msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  try {
    // Set viewport size
    await page.setViewportSize({
      width: mergedOptions.width!,
      height: mergedOptions.height!
    });

    // Navigate to the preview page
    try {
      await page.goto(previewUrl);
    } catch (err: any) {
      if (err.message && err.message.includes("ECONNREFUSED")) {
        throw new Error(`Could not connect to ${previewUrl}. Make sure the Next.js dev server is running.`);
      }
      throw err;
    }
    // Wait for the component to be rendered
    await page.waitForLoadState("networkidle");
    await page.evaluate((spec: UIBundle) => {
      window.setUIBundle(spec);
    }, spec);

    // Wait for UI bundle processing to complete (either success or error)
    // This is much more robust than a fixed timeout
    try {
      await page.waitForFunction(
        () => window.isUIReady?.() === true,
        { timeout: 10000 } // 10 second timeout as fallback
      );
    } catch {
      throw new Error("Timeout waiting for UI bundle to complete processing. This may indicate a rendering issue.");
    }

    // Check for UIBundle errors first
    const uiBundleError = await page.evaluate(() => {
      return window.getUIBundleError?.();
    });
    if (uiBundleError) {
      throw new UIBundleError(uiBundleError.originalError || uiBundleError, spec);
    }

    // Check for console errors
    const errors = consoleMessages.filter(msg => msg.type === "error");
    if (errors.length > 0) {
      throw new Error(`Console errors: ${errors.map(e => e.text).join("\n")}`);
    }

    // Take screenshot
    const body = await page.$("body");
    if (!body?.isVisible()) {
      throw new Error("Body is not visible. Maybe nothing is rendered?");
    }

    const screenshot = await body?.screenshot({ timeout: 5000 });
    if (!screenshot) {
      logger.error(await body?.innerHTML());
      logger.error(consoleMessages);
      throw new Error("Failed to take screenshot");
    }

    return screenshot;
  } finally {
    await browser.close();
  }
}

export function getPreviewUrl(uuid: string): string {
  return `${PREVIEW_SERVER_URL}/preview/${uuid}`;
}
