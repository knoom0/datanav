import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default function ChatPage() {
  // Generate a new UUID and redirect to the sessionId route
  const sessionId = uuidv4();
  redirect(`/chat/${sessionId}`);
} 