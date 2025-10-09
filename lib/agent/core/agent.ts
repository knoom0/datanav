import { randomUUID } from "crypto";
import { inspect } from "util";

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { LanguageModelV2, ImageModelV2 } from "@ai-sdk/provider";
import { LangfuseClient } from "@langfuse/client";
import { startActiveObservation } from "@langfuse/tracing";
import { type UIMessage, TextUIPart, ReasoningUIPart, type ModelMessage, type UserContent, type Tool, createUIMessageStream, type InferUIMessageChunk, type UIMessageStreamWriter, wrapLanguageModel, extractReasoningMiddleware, defaultSettingsMiddleware } from "ai";
import { z } from "zod/v3";

import { getConfig } from "@/lib/config";
import logger from "@/lib/logger";
import { Project, ActionableError } from "@/lib/types";
import { safeErrorString } from "@/lib/util/log-util";

// Langfuse v4 uses OpenTelemetry integration, no need for explicit client instance

/**
 * List of model names that have built-in reasoning capabilities
 */
const REASONING_MODEL_NAMES = [
  "gpt-5",
  "o1-preview",
  "o1-mini",
  "o1",
  "o3-mini",
  "o3"
];

/**
 * Determines if a given model is a LanguageModelV2 based on its properties
 */
export function isLanguageModel(model: any): model is LanguageModelV2 {
  return "doGenerate" in model && "specificationVersion" in model && model.specificationVersion === "v2";
}

/**
 * Determines if a given LanguageModel is a reasoning model based on its model ID
 */
export function isReasoningModel(model: LanguageModelV2): boolean {
  return REASONING_MODEL_NAMES.includes(model.modelId);
}

/**
 * Type alias for tools that have a name property
 */
export type NamedTool = Tool & { name: string };

export type ChatMessage = Omit<UIMessage, "id">;

/**
 * Type alias for UIMessage streams - represents a readable stream of UI message chunks
 */
export type UIMessageStream = ReadableStream<InferUIMessageChunk<UIMessage>>;

/**
 * Base class for AI agent tools that provides consistent error handling and call recording
 */
export abstract class BaseAgentTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: any; // Zod schema
  
  private lastCall: { params: any; result: any; timestamp: Date } | null = null;
  private static toolCalls = new Map<string, { params: any; result: any; timestamp: Date }>();

  /**
   * Execute the tool with basic error handling and call recording
   */
  async execute(params: any): Promise<string> {
    let result: any = {};
    try {
      result = await this.executeInternal(params);
      
      // Record the call
      const callRecord = { params, result, timestamp: new Date() };
      this.lastCall = callRecord;
      BaseAgentTool.toolCalls.set(this.name, callRecord);
    } catch (error) {
      logger.error(`agent tool error: error: ${error}, actionable: ${error instanceof ActionableError}, params: ${safeErrorString(params)}`);
      result["error"] = `${error}`;
    }
    return JSON.stringify(result, null, 2);
  }

  /**
   * Get the last call made to this specific tool instance
   */
  getLastCall(): { params: any; result: any; timestamp: Date } | null {
    return this.lastCall;
  }


  /**
   * Abstract method that child classes must implement
   */
  protected abstract executeInternal(params: any): Promise<any>;
}

const NextActionSchema = z.object({
  agentAction: z.enum(["proceed", "stop"]),
  reason: z.string(),
  userActions: z.array(z.object({
    label: z.string(),
    description: z.string(),
    actionLink: z.string().optional()
  })).optional()
});

export type NextAction = z.infer<typeof NextActionSchema>;

export class NextActionTool extends BaseAgentTool {
  readonly name = "next_action";
  readonly description = "Communicate back to caller with next action decision and optional structured user actions";
  readonly inputSchema = NextActionSchema;

  protected async executeInternal(params: NextAction): Promise<NextAction> {
    return params;
  }
}

/**
 * Helper function to generate a tools map from a list of Tool objects with names
 * This allows us to encapsulate tool naming into tool implementations
 * @param tools - Array of NamedTool instances
 * @returns Object with tool names as keys and tool instances as values
 */
export function createToolsMap(tools: NamedTool[]): Record<string, Tool> {
  return tools.reduce((acc, tool) => {
    acc[tool.name] = tool;
    return acc;
  }, {} as Record<string, Tool>);
}


export type EvoAgentCallback = (params: {
  result: any;
  writer: UIMessageStreamWriter;
  nextAction?: NextAction;
}) => void;
export type EvoAgentOnErrorCallback = (error: any) => void;

export type StreamParams = {
  messages: ModelMessage[];
  onFinish?: EvoAgentCallback;
  onError?: EvoAgentOnErrorCallback;
};

export type EvalParams = {
  messages: ModelMessage[];
  output: string;
  outputImage?: Buffer;
};

export interface EvoAgent {
  readonly project: Project;
  stream(params: StreamParams): UIMessageStream;
}

export type IterationResult = {
  success: boolean;
  response: any;
  evaluationMessage?: UserContent;
  nextAction?: NextAction;
};

export abstract class EvoAgentBase implements EvoAgent {
  readonly project: Project;
  protected readonly maxIterations: number;

  constructor({ project, maxIterations = 1 }: { project: Project; maxIterations?: number }) {
    this.project = project;
    this.maxIterations = maxIterations;
  }

  abstract iterate(params: { messages: ModelMessage[], writer: UIMessageStreamWriter, iteration: number }): Promise<IterationResult>;

  stream(params: StreamParams): UIMessageStream {
    const { messages, onFinish, onError } = params;
    
    // Get the last message text for trace input
    const lastMessage = messages[messages.length - 1];
    const inputText = lastMessage?.content || "";
    return createUIMessageStream({
      execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
        await startActiveObservation(`${this.constructor.name}.stream`, async (span) => {
          // Log the trace URL for debugging
          const langfuse = new LangfuseClient();
          logger.info(`Trace URL: ${await langfuse.getTraceUrl(span.traceId)}`);
          
          span.update({ 
            input: inputText,
            metadata: { maxIterations: this.maxIterations }
          });

          startUIMessageStream(writer);
          try {
            const currentMessages = [...messages];
            let iteration = 0;
            let lastResult: IterationResult | null = null;

            while (iteration < this.maxIterations) {
              iteration++;
              
              logger.info(`Starting iteration ${iteration}/${this.maxIterations} for ${this.constructor.name}`);

              // Call iterate with current messages and dataStream
              const result = await this.iterate({ messages: currentMessages, writer, iteration });

              // Throw if no result to minimize indentation
              if (!result) {
                logger.error(`Iteration ${iteration} failed: No result produced`);
                throw new Error("Iteration did not produce a result");
              }

              if (result.success) {
                // Success - we're done
                logger.info(`Iteration ${iteration} completed successfully for ${this.constructor.name}`);
                lastResult = result;
                break;
              }

              // Failure - add feedback and continue if we have iterations left
              logger.info(`Iteration ${iteration} failed for ${this.constructor.name}: ${result.response}`);
              if (iteration < this.maxIterations && result.evaluationMessage) {
                logger.warn(`Iteration ${iteration} finished, continuing to next iteration. Remaining: ${this.maxIterations - iteration}`);
                currentMessages.push({
                  role: "assistant",
                  content: result.response.text
                });                
                // Add feedback message
                currentMessages.push({
                  role: "user",
                  content: result.evaluationMessage
                });
              } else {
                // Max iterations reached
                logger.warn(`Iteration ${iteration} finished and max iterations reached for ${this.constructor.name}`);
                lastResult = result;
              }
            }

            span.update({
              output: lastResult?.response?.text || ""
            });
            onFinish?.({
              result: lastResult,
              writer: writer,
              nextAction: lastResult?.nextAction
            });
          } catch (error) {
            // Handle any error that occurs during execution
            const errorMessage = `${this.constructor.name}.stream error: ${safeErrorString(error)}`;
            span.update({ output: { error: errorMessage } });
            onError?.(error);
            writer.write({
              type: "error",
              errorText: errorMessage
            });
          }
          finishUIMessageStream(writer);
        });
      },
      onError: (error) => {
        onError?.(error);
        return `${this.constructor.name}.stream error: ${safeErrorString(error)}`;
      }
    });
  }
}


/**
 * Options for pipeUIMessageStream function
 */
export type PipeUIMessageStreamOptions = {
  /** Whether to omit "start" and "finish" type messages when piping the stream (default false) */
  omitStartFinish?: boolean;
};

/**
 * Pipes UIMessage stream data from a source stream to a target stream until completion
 * @param source The source UIMessageStream
 * @param target The target UIMessageStreamWriter
 * @param options Optional configuration for piping behavior
 * @returns Promise that resolves when the source stream is fully consumed
 */
export async function pipeUIMessageStream(
  source: UIMessageStream, 
  target: UIMessageStreamWriter,
  options: PipeUIMessageStreamOptions = {}
): Promise<void> {
  const { omitStartFinish = false } = options;
  const reader = source.getReader();
  try {
     
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Filter out start/finish messages and metadata if requested
      if (omitStartFinish && (value.type === "start" || value.type === "finish" || value.type === "message-metadata")) {
        continue;
      }
      
      target.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Writes a start message and metadata to a UIMessageStreamWriter
 * @param writer The UIMessageStreamWriter to write to
 */
export function startUIMessageStream(writer: UIMessageStreamWriter): void {
  // Write metadata with start time
  writer.write({
    type: "message-metadata" as const,
    messageMetadata: { startedAt: Date.now() },
  });
  writer.write({ type: "start" });
}

/**
 * Writes a finish message and metadata to a UIMessageStreamWriter
 * @param writer The UIMessageStreamWriter to write to
 */
export function finishUIMessageStream(writer: UIMessageStreamWriter): void {
  writer.write({ type: "finish" });
  // Write metadata with finish time
  writer.write({
    type: "message-metadata" as const,
    messageMetadata: { finishedAt: Date.now() },
  });
}

/**
 * Writes a text message to a UIMessageStreamWriter.
 * @param writer The UIMessageStreamWriter to write to
 * @param text The text to write
 */
export function writeText(writer: UIMessageStreamWriter, text: string): void {
  const textId = randomUUID();
  writer.write({ type: "text-start", id: textId });
  writer.write({ type: "text-delta", id: textId, delta: text });
  writer.write({ type: "text-end", id: textId });
}

export class EvoAgentChain implements EvoAgent {
  readonly agents: EvoAgent[];
  readonly project: Project;

  constructor({ agents, project }: { agents: EvoAgent[]; project: Project }) {
    this.agents = agents;
    this.project = project;
    if (agents.length === 0) throw new Error("EvoAgentChain requires at least one agent");
  }

  stream({messages, onFinish, onError}: StreamParams): UIMessageStream {
    return createUIMessageStream({
      execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
        const agents = [...this.agents];
        let agentResult: any = null;
        let shouldFinishChain = false;
        
        startUIMessageStream(writer);
        for (const [index, agent] of agents.entries()) {
          const isLastAgent = index === (agents.length - 1);
          let agentError: any = null;
          if (agentResult) {
            agentResult = null;
          }
          const res = agent.stream({
            messages,
            onFinish: ({ result, nextAction }) => {
              agentResult = result;
              if (nextAction?.agentAction === "stop" || isLastAgent) {
                shouldFinishChain = true;
                onFinish?.({
                  result,
                  writer,
                  nextAction
                });
              }
            },
            onError: (error) => {
              agentError = error;
            }
          });

          await pipeUIMessageStream(res, writer, { omitStartFinish: true });

          if (agentError) {
            onError?.(agentError);
            const errorMessage = `${agent.constructor.name} error: ${safeErrorString(agentError)}`;
            writer.write({
              type: "error",
              errorText: errorMessage
            });
            break;
          }
          
          // Break out of loop if chain should finish early
          if (shouldFinishChain) {
            break;
          }

          // Append text parts from agentResult to messages so that the next agent can better understand the context
          if (agentResult?.text) {
            messages.push({
              role: "assistant",
              content: agentResult.text
            });
          }
        }
        finishUIMessageStream(writer);
      },
      onError: (error) => {
        onError?.(error);
        return `EvoAgentChain.stream error:${safeErrorString(error)}`;
      }
    });
  }
}

// Helper to create a TransformStream that encodes string chunks to Uint8Array
function createTextEncodedStream(stream: ReadableStream<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const transformedStream = new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      const encoded = encoder.encode(chunk);
      controller.enqueue(encoded);
    }
  });
  return stream.pipeThrough(transformedStream);
}

/**
 * Utility function to print the contents of an agent stream in a structured way using processDataStream
 * @param stream The ReadableStream to process
 * @returns A promise that resolves when the stream is fully processed
 */
export async function printAgentStream(stream: any): Promise<void> {
  const processedStream = createTextEncodedStream(stream);

  let lastType: string | null = null;

  function handlePart(type: string, value: unknown, writeRaw: boolean = false) {
    if (lastType !== type) {
      if (lastType !== null) process.stdout.write("\n");
      process.stdout.write(`${type.charAt(0).toUpperCase() + type.slice(1)}:\n`);
      lastType = type;
    }
    if (writeRaw) {
      process.stdout.write(String(value));
    } else {
      process.stdout.write(String(value) + "\n");
    }
  }

  const reader = processedStream.getReader();
  try {
     
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = new TextDecoder().decode(value);
      const lines = text.split("\n").filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith("0:")) {
          handlePart("text", JSON.parse(line.slice(2)), true);
        } else if (line.startsWith("3:")) {
          handlePart("error", JSON.parse(line.slice(2)));
        } else if (line.startsWith("g:")) {
          handlePart("reasoning", JSON.parse(line.slice(2)), true);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Utility function to process a stream from EvoAgent.stream and return a UIMessage object.
 * Aggregates continuous same-type parts into a single message part.
 * @param stream The data stream to process
 * @param outputToConsole Optional flag to output parts to console as they are processed
 */
export async function agentStreamToMessage(stream: any, outputToConsole: boolean = false): Promise<UIMessage> {
  const parts: UIMessage["parts"] = [];
  const messageMeta: Partial<UIMessage> = {};

  // Console output helper that handles both strings and objects
  function writeToConsole(content: string | object) {
    if (!outputToConsole) return;
    
    if (typeof content === "string") {
      process.stdout.write(content);
    } else {
      // Use util.inspect for objects with truncation for long strings
      const formatted = inspect(content, {
        depth: 3,
        maxStringLength: 100,
        maxArrayLength: 10,
        colors: false,
        compact: false,
        breakLength: 80
      });
      process.stdout.write(formatted);
    }
  }

  // Type guards for part types
  function isTextUIPart(part: UIMessage["parts"][number]): part is { type: "text"; text: string } {
    return part.type === "text";
  }
  function isReasoningUIPart(part: UIMessage["parts"][number]): part is ReasoningUIPart {
    return part.type === "reasoning";
  }

  // Helper to aggregate same-type parts and handle console output
  let lastPartType: string | null = null;
  
  function outputCompletedPart(part: UIMessage["parts"][number]) {
    if (!outputToConsole) return;
    
    // Add header if switching part types
    if (lastPartType !== part.type) {
      if (lastPartType !== null) {
        writeToConsole("\n");
      }
      writeToConsole(`${part.type.charAt(0).toUpperCase() + part.type.slice(1)}:\n`);
      lastPartType = part.type;
    }
    
    // Output the completed part content
    if (part.type === "text") {
      writeToConsole((part as TextUIPart).text);
    } else if (part.type === "reasoning") {
      writeToConsole((part as ReasoningUIPart).text);
    } else if (part.type === "file") {
      writeToConsole((part as any).url || (part as any).filename || "File");
    } else if (part.type === "source-url" || part.type === "source-document") {
      writeToConsole((part as any).url || (part as any).filename || "Source");
    } else if (part.type.startsWith("tool-")) {
      writeToConsole(JSON.stringify(part));
    }
  }
  
  function pushPart(part: UIMessage["parts"][number]) {
    const isAggregating = parts.length > 0 && parts[parts.length - 1].type === part.type;
    
    if (isAggregating) {
      if (isTextUIPart(part) && isTextUIPart(parts[parts.length - 1])) {
        const existingPart = parts[parts.length - 1] as TextUIPart;
        existingPart.text += part.text;
        // Don"t output during aggregation - wait until part is complete
        return;
      }
      if (isReasoningUIPart(part) && isReasoningUIPart(parts[parts.length - 1])) {
        const existingPart = parts[parts.length - 1] as ReasoningUIPart;
        existingPart.text += part.text;
        // Don"t output during aggregation - wait until part is complete
        return;
      }
      // For other types, just push as new part
    }
    
    // If we have a previous part and we"re switching types, output the completed previous part
    if (parts.length > 0 && (!isAggregating || part.type !== parts[parts.length - 1].type)) {
      outputCompletedPart(parts[parts.length - 1]);
    }
    
    // Add the new part
    parts.push(part);
    
    // For non-aggregating types, output immediately since they"re complete
    if (part.type !== "text" && part.type !== "reasoning") {
      outputCompletedPart(part);
    }
  }

  const reader = stream.getReader();
  try {
     
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Handle different value types from the stream
      let stringValue: string;
      if (typeof value === "string") {
        stringValue = value;
      } else if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        stringValue = new TextDecoder().decode(value);
      } else {
        // Fallback: try to convert to string directly
        stringValue = String(value);
      }
      
      const lines = stringValue.split("\n").filter((line: string) => line.trim());
      
      for (const line of lines) {
        if (line.startsWith("0:")) {
          pushPart({ type: "text", text: JSON.parse(line.slice(2)) });
        } else if (line.startsWith("g:")) {
          pushPart({ type: "reasoning", text: JSON.parse(line.slice(2)) } as any);
        } else if (line.startsWith("3:")) {
          throw JSON.parse(line.slice(2));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Output the final part if it exists (in case stream ended during aggregation)
  if (parts.length > 0) {
    outputCompletedPart(parts[parts.length - 1]);
    // Add final newline for clean output
    if (outputToConsole) {
      writeToConsole("\n");
    }
  }

  // Create a content property by aggregating all text from text parts
  const textParts = parts.filter((part): part is { type: "text"; text: string } => part.type === "text");
  const content = textParts.map(part => part.text).join("");

  // Compose the UIMessage
  const uiMessage: UIMessage = {
    id: messageMeta.id || "",
    role: messageMeta.role || "assistant",
    parts,
    content,
    // Add any other fields from messageMeta if needed
  } as UIMessage;
  return uiMessage;
}

/**
 * Returns an array of annotations of a given type from a message.
 */
export function searchMessageAnnotations(_message: UIMessage, _annotationType: any): any[] {
  // In AI SDK v5, annotations are handled differently
  // This is a compatibility function that returns an empty array for now
  return [];
}


/**
 * Returns model instance for the given agent based on configuration.
 * Accepts an agent instance or a class name. Falls back to the default agent model
 * when a per-agent model is not configured. Supports either instantiated models in config
 * or string specs like "openai:gpt-4.1" or "anthropic:claude-3-5".
 * 
 * For non-reasoning models, wraps the model with extractReasoningMiddleware to enable
 * reasoning tags support. Provider options are embedded in the model using defaultSettingsMiddleware.
 */
export function getAgentModel(objectOrClass: any): LanguageModelV2 | ImageModelV2 {
  const className = resolveAgentClassName(objectOrClass);
  const config = getConfig();
  const agentConfig: any = (config as any).agent ?? {};
  const agentKey = className ? className.charAt(0).toLowerCase() + className.slice(1) : "";
  const agentSpecificConfig = agentConfig?.[agentKey] ?? {};
  const configuredModel = agentSpecificConfig?.model ?? agentConfig?.model;

  if (!configuredModel || typeof configuredModel !== "string") {
    throw new Error(`No model configured for agent '${className}' and no default agent model found`);
  }

  let model: LanguageModelV2 | ImageModelV2;
  const { provider, model: modelName } = parseModelSpec(configuredModel);
  switch (provider) {
  case "openai":
    model = openai(modelName);
    break;
  case "anthropic":
    model = anthropic(modelName);
    break;
  default:
    throw new Error(`Unsupported model provider '${provider}' in model spec '${configuredModel}'`);
  }

  // Apply middlewares to the model
  const middlewares = [];
  
  // Add extractReasoningMiddleware for non-reasoning language models
  if (isLanguageModel(model) && !isReasoningModel(model)) {
    middlewares.push(extractReasoningMiddleware({ tagName: "reasoning" }));
  }
  
  // Add defaultSettingsMiddleware if provider options are configured
  if (agentSpecificConfig?.providerOptions) {
    middlewares.push(defaultSettingsMiddleware({ settings: agentSpecificConfig.providerOptions }));
  }
  
  // Wrap the model with middleware if any are configured
  if (middlewares.length > 0) {
    model = wrapLanguageModel({
      model,
      middleware: middlewares
    });
  }
  
  return model;
}


function resolveAgentClassName(objectOrClass: any): string {
  if (typeof objectOrClass === "object" && "constructor" in objectOrClass) {
    return objectOrClass.constructor.name;
  }
  // if it"s a class, return the name
  if (typeof objectOrClass === "function") {
    return objectOrClass.name;
  }
  return String(objectOrClass);
}

function parseModelSpec(spec: string): { provider: string; model: string } {
  // Accept formats like "provider:model" or just "model" (defaults to openai)
  const hasDelimiter = spec.includes(":");
  if (!hasDelimiter) {
    return { provider: "openai", model: spec };
  }
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  return { provider: provider.trim(), model: model.trim() };
}
