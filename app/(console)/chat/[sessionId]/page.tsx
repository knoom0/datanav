"use client";

import { useChat } from "@ai-sdk/react";
import { Box, Stack, Group, Button } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { useState, use, useEffect } from "react";

import AgentInput from "@/components/agent-input";
import { useAppTitle } from "@/components/app-title-context";
import { ArtifactView } from "@/components/artifact-view";
import { ChatView } from "@/components/chat-view";
import { TypedUIMessage } from "@/lib/types";
import { extractArtifacts, getLatestAssistantMessage } from "@/lib/util/message-util";

interface ChatPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { sessionId } = use(params);
  const { setTitle } = useAppTitle();
  const t = useTranslations();
  
  const useChatHelpers = useChat<TypedUIMessage>({
    transport: new DefaultChatTransport({
      api: `/api/chatbot/chat/${sessionId}`,
    }),
    onFinish: ({ message }) => {
      // eslint-disable-next-line no-console
      console.log(message);
      
      // Auto-open artifact view when a new message finishes and contains artifacts
      if (message.role === "assistant") {
        const messageArtifacts = extractArtifacts(message);
        if (messageArtifacts.length > 0) {
          setIsOverlayOpen(true);
        }
      }
    },
  });
  const { messages, error } = useChatHelpers;
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  // Extract artifacts from the latest assistant message only
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  const artifacts = latestAssistantMessage 
    ? extractArtifacts(latestAssistantMessage) 
    : [];

  // Set page title when component mounts
  useEffect(() => {
    setTitle(t("DataNav"));
  }, [setTitle, t]);

  // Show loading state while sessionId is being resolved
  if (!sessionId) {
    return null;
  }

  return (
    <Box className="mobile-width" h={"calc(100dvh - 60px)"}>
        <Stack h="100%" w="100%">
          {/* Main Content Area */}
          <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }} pos="relative" p={0}>
            <ChatView messages={messages} error={error} />
          
          {/* Floating Overlay Toggle Buttons - Bottom Center */}
          {artifacts.length > 0 && (
            <Group
              pos="absolute"
              bottom={16}
              left="50%"
              style={{ 
                zIndex: 100,
                transform: "translateX(-50%)",
              }}
              gap="xs"
            >
              <Button
                size="md"
                variant="filled"
                onClick={() => setIsOverlayOpen(true)}
                title={t("Open artifact view")}
                leftSection={<IconEye size={16} />}
              >
                {t("Show Report")}
              </Button>
            </Group>
          )}
        </Box>

        <Box p="md" style={{ flexGrow: 0 }} pt={0}>
          <AgentInput useChatHelpers={useChatHelpers} />
        </Box>
      </Stack>
      
      {/* Artifact View */}
      <ArtifactView 
        artifacts={artifacts}
        isOpen={isOverlayOpen}
        onClose={() => setIsOverlayOpen(false)}
      />
    </Box>
  );
}
