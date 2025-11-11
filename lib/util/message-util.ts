import { UIMessage } from "@ai-sdk/react";
import { ModelMessage } from "ai";

import { Project, PROJECT_PART_TYPE, UI_BUNDLE_PART_TYPE, REPORT_BUNDLE_PART_TYPE, Artifact, TypedUIMessage } from "@/lib/types";

/**
 * Extract text content from a UIMessage
 * Handles both simple content strings and structured parts
 */
export function extractTextFromMessage(message: TypedUIMessage): string {
  // Check for simple content string (UIMessage can have content property)
  if ("content" in message && typeof message.content === "string") {
    return message.content;
  }

  // Check for parts array
  if (message.parts && Array.isArray(message.parts)) {
    const textParts = message.parts
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text || "")
      .join(" ");
    if (textParts) {
      return textParts;
    }
  }

  return "";
}

/**
 * Extract a Project object from the last assistant message annotations
 * Returns null if no project is found
 */
export function extractLastProject(messages: ModelMessage[]): Project | null {
  // Find the last assistant message
  const lastAssistantMessage = messages.findLast(msg => msg.role === "assistant");
  
  if (lastAssistantMessage && (lastAssistantMessage as any).annotations) {
    const annotations = (lastAssistantMessage as any).annotations;
    if (Array.isArray(annotations)) {
      for (const annotation of annotations) {
        if (annotation.type === "project" && annotation.data) {
          return Project.fromJSON(annotation.data);
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract the prompt from the last user message
 * Returns empty string if no user message is found
 */
export function extractLastPrompt(messages: ModelMessage[]): string {
  const lastUserMessage = messages.findLast((msg: ModelMessage) => msg.role === "user");
  return typeof lastUserMessage?.content === "string" 
    ? lastUserMessage.content 
    : "";
}

/**
 * Save a project to the data stream as an annotation
 */
export function saveProject(project: Project, writer: any): void {
  writer.write({
    type: PROJECT_PART_TYPE,
    data: project.toJSON()
  });
}

/**
 * Get the latest assistant message from an array of messages
 * Returns undefined if no assistant message is found
 */
export function getLatestAssistantMessage(messages: UIMessage[]): UIMessage | undefined {
  return messages.filter(m => m.role === "assistant").pop();
}

/**
 * Filter messages to keep only user messages
 * Returns an array containing only messages with role === "user"
 */
export function filterUserMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((msg: ModelMessage) => msg.role === "user");
}

/**
 * Check if a message has a part of the specified type
 * Returns true if the message contains a part with the given type
 */
export function hasPart(message: UIMessage | undefined, partType: string): boolean {
  if (!message) return false;
  
  const parts = (message as any).parts;
  if (!Array.isArray(parts)) return false;
  
  return parts.some((part: any) => part.type === partType);
}

/**
 * Extract artifacts from a message by looking at its parts
 * Returns an array of artifacts found in the message
 */
export function extractArtifacts(message: UIMessage): Artifact[] {
  if (!message || !message.parts || !Array.isArray(message.parts)) {
    return [];
  }

  const artifacts: Artifact[] = [];

  for (const part of message.parts) {
    if (part.type === UI_BUNDLE_PART_TYPE && part.data) {
      artifacts.push(part.data as Artifact);
    } else if (part.type === REPORT_BUNDLE_PART_TYPE && part.data) {
      artifacts.push(part.data as Artifact);
    }
  }

  return artifacts;
}

/**
 * Convert an array to a ReadableStream
 * Creates a stream that yields each item from the array in order
 */
export function arrayToStream<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const item of items) {
        controller.enqueue(item);
      }
      controller.close();
    }
  });
}

/**
 * Convert a ReadableStream to an array
 * Reads all chunks from the stream and returns them as an array
 */
export async function streamToArray<T>(stream: ReadableStream<T>): Promise<T[]> {
  const chunks: T[] = [];
  const reader = stream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  
  return chunks;
}

