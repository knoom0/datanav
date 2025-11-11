import ChatPageClient from "@/app/(console)/chat/[sessionId]/client";
import { AgentSession } from "@/lib/agent/session";
import { getUserDataSource } from "@/lib/entities";

interface ChatPageProps {
  params: Promise<{
    sessionId: string;
  }>;
  searchParams: Promise<{
    createNewSession?: string;
    prompt?: string;
  }>;
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { sessionId } = await params;
  const { createNewSession, prompt } = await searchParams;

  const dataSource = await getUserDataSource();

  // Create or get session
  const session = createNewSession === "true"
    ? await AgentSession.create({
        sessionId,
        dataSource,
        agentName: "chatbot",
        agentConfig: {}
      })
    : await AgentSession.get({
        sessionId,
        dataSource
      });

  // Finalize any stale streams and get initial messages
  await session.finalizeStaleStream();
  const initialMessages = await session.getMessages();

  return (
    <ChatPageClient 
      sessionId={sessionId} 
      initialMessages={initialMessages}
      initialPrompt={prompt || null}
      sessionTitle={session.title}
    />
  );
}
