"use client";

import { Container, Stack, Title } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

import AgentInput from "@/components/agent-input";
import { ChatStatus } from "@/lib/types";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default function ChatPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ChatStatus>("ready");

  const handleSubmit = ({ text }: { text: string }) => {
    setStatus("submitted");
    // Generate a new session ID and redirect with createNewSession flag
    const sessionId = uuidv4();
    router.push(`/chat/${sessionId}?createNewSession=true&prompt=${encodeURIComponent(text.trim())}`);
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={1}>What do you want to analyze today?</Title>
        <AgentInput
          onSubmit={handleSubmit}
          onStop={() => {}}
          status={status}
        />
      </Stack>
    </Container>
  );
}
