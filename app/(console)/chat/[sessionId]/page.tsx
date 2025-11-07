import ChatPageClient from "@/app/(console)/chat/[sessionId]/client";
import { AgentSession } from "@/lib/agent/session";
import { getUserDataSource } from "@/lib/entities";

interface ChatPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { sessionId } = await params;

  // Fetch messages server-side
  const dataSource = await getUserDataSource();
  const session = await AgentSession.get({
    sessionId,
    dataSource
  });
  await session.finalizeStaleStream();
  const initialMessages = await session.getMessages();

  return <ChatPageClient sessionId={sessionId} initialMessages={initialMessages} />;
}
