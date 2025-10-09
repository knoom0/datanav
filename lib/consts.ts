import { openai } from "@ai-sdk/openai";

/**
 * Default AI model used for QA, evaluation, and general AI tasks
 */
export const DEFAULT_QA_MODEL = openai("gpt-4o-mini");


/**
 * Default maximum steps for agent iterations
 */
export const DEFAULT_MAX_STEP = 100;

/**
 * URL patterns for data connector authentication
 */
export const DATA_CONNECTOR_URLS = {
  AUTH_CALLBACK_PATH: "/data/auth-callback",
} as const;