// Load environment variables from .env.local (for LLM API keys)
import { config } from "dotenv"
config({ path: ".env.local" })
import "reflect-metadata"
import { beforeAll, vi } from "vitest"

import logger from "@/lib/logger"

// Polyfill fetch for Node.js environment
if (typeof globalThis.fetch === "undefined") {
  const { default: fetch } = await import("node-fetch")
  globalThis.fetch = fetch as any
}

// Polyfill structuredClone for Node.js environment
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (obj: any) => {
    return JSON.parse(JSON.stringify(obj))
  }
}

// Polyfill setImmediate for Playwright
if (typeof globalThis.setImmediate === "undefined") {
  globalThis.setImmediate = setTimeout as any
}

// Polyfill ReadableStream for Node.js environment
if (typeof globalThis.ReadableStream === "undefined") {
  const streamWeb = await import("stream/web")
  globalThis.ReadableStream = streamWeb.ReadableStream as any
  globalThis.WritableStream = streamWeb.WritableStream as any
  globalThis.TransformStream = streamWeb.TransformStream as any
}

// Mock Langfuse to avoid dynamic import issues across all tests
vi.mock("@langfuse/openai", () => ({
  observeOpenAI: vi.fn().mockImplementation((client) => client)
}))

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: vi.fn(),
  ShouldExportSpan: vi.fn(),
}))

vi.mock("@langfuse/tracing", () => ({
  startActiveObservation: vi.fn().mockReturnValue({
    end: vi.fn(),
    event: vi.fn(),
    span: vi.fn(),
    generation: vi.fn(),
  }),
}))

// Only define onUIBundleReady when running in Node test environment
const isJsdom = typeof window !== "undefined" &&
                navigator?.userAgent?.includes("jsdom")
if (!isJsdom) {
  beforeAll(async () => {
    const { getPreviewUrl } = await import("@/lib/ui-kit/ui-tester")
    const { putUIBundle } = await import("@/lib/ui-kit/ui-repo")

    ;(globalThis as any).onUIBundleReady = async function(uiBundle: any) {
      const uuid = await putUIBundle(uiBundle)
      const previewUrl = getPreviewUrl(uuid)
      logger.info(`Preview your UI at: ${previewUrl}`)
      return uuid
    }
  })
} 

globalThis.AI_SDK_LOG_WARNINGS = false

// Setup jest-dom and polyfills for component tests
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest")
  
  // Configure @testing-library/react defaults
  const { configure } = await import("@testing-library/react")
  configure({
    asyncUtilTimeout: 5000, // Default timeout for waitFor, findBy, etc (5 seconds)
  })
  
  // Mock matchMedia for jsdom environment
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
