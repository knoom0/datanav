import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { LanguageModelV2 } from "@ai-sdk/provider";

import { getConfig } from "@/lib/config";

/**
 * Parse model spec string into provider and model name
 * Supports formats like "openai:gpt-4.1" or just "gpt-4.1" (defaults to openai)
 */
function parseModelSpec(spec: string): { provider: string; model: string } {
  const hasDelimiter = spec.includes(":");
  if (!hasDelimiter) {
    return { provider: "openai", model: spec };
  }
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  return { provider: provider.trim(), model: model.trim() };
}

/**
 * Get a small model instance for lightweight tasks like title generation
 * Uses the model.small configuration from datanav.config.ts
 */
export function getSmallModel(): LanguageModelV2 {
  const config = getConfig();
  const modelSpec = (config as any).model?.small;

  if (!modelSpec || typeof modelSpec !== "string") {
    throw new Error("No small model configured. Please set model.small in datanav.config.ts");
  }

  const { provider, model: modelName } = parseModelSpec(modelSpec);
  
  switch (provider) {
  case "openai":
    return openai(modelName);
  case "anthropic":
    return anthropic(modelName);
  default:
    throw new Error(`Unsupported model provider '${provider}' in model spec '${modelSpec}'`);
  }
}

/**
 * Get an embedding model instance
 * Uses the model.embedding configuration from datanav.config.ts
 * Note: Currently only OpenAI embedding models are supported
 */
export function getEmbeddingModel(): any {
  const config = getConfig();
  const modelSpec = (config as any).model?.embedding;

  if (!modelSpec || typeof modelSpec !== "string") {
    throw new Error("No embedding model configured. Please set model.embedding in datanav.config.ts");
  }

  const { provider, model: modelName } = parseModelSpec(modelSpec);
  
  switch (provider) {
  case "openai":
    return openai.embedding(modelName);
  case "anthropic":
    throw new Error("Anthropic does not support embedding models. Please use an OpenAI embedding model.");
  default:
    throw new Error(`Unsupported model provider '${provider}' in model spec '${modelSpec}'`);
  }
}

