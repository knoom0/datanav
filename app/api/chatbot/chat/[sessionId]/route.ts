import { convertToModelMessages, createUIMessageStreamResponse } from "ai";

import logger from "@/lib/logger";
import { Chatbot } from "@/lib/meta-agent/chatbot";
import { Project, TypedUIMessage } from "@/lib/types";
import { extractLastProject, extractLastPrompt, saveProject } from "@/lib/util/message-util";

interface RouteContext {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function POST(req: Request, { params }: RouteContext) {
  const { sessionId } = await params;
  
  const { messages: uiMessages }: { messages: TypedUIMessage[] } = await req.json();
  const messages = convertToModelMessages(uiMessages);

  // Extract Project object from the annotations of the last assistant message.
  // If no project exists, create one using the last user message as prompt and sessionId
  const project = extractLastProject(messages) ?? new Project(extractLastPrompt(messages), sessionId);

  // Create Chatbot instance using static factory method
  const chatbot = await Chatbot.create(project);

  // Stream response with metadata automatically added by EvoAgentChain
  const stream = chatbot.stream({
    messages,
    onFinish: ({ writer }) => {
      saveProject(project, writer);
    },
    onError: (error) => {
      logger.error("Chatbot stream error:", error);
    }
  });

  return createUIMessageStreamResponse({ stream });
}
