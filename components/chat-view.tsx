"use client";

import { Paper, Box, Stack, Group, Container, ScrollArea, Text, Code, Image, Alert, Modal, Button } from "@mantine/core";
import { IconAlertCircle, IconExternalLink, IconClock } from "@tabler/icons-react";
import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";

import { DataConnectButton } from "@/components/data-connect-button";
import { TypedUIMessage } from "@/lib/types";

// Constants to avoid hardcoded strings - these must match DataConnectorTool schema values
// See lib/ui-gen/data/tool.ts DataConnectorTool.name and DataConnectorToolSchema
const DATA_CONNECTOR_TOOL_NAME = "data_connector";
const ASK_TO_CONNECT_OPERATION = "ask_to_connect";

/**
 * Maps tool IDs to human-friendly status messages
 */
const TOOL_DISPLAY_MESSAGES: Record<string, string> = {
  "tool-database_client": "Querying database...",
  "tool-next_action": "Deciding what to do...",
  "tool-project_tool": "Accessing project artifacts...",
  "tool-text_editor": "Editing code files...",
  "tool-data_connector": "Connecting to data source..."
};

/**
 * Gets a human-friendly display message for a tool ID
 */
function getToolDisplayMessage(toolId: string): string {
  return TOOL_DISPLAY_MESSAGES[toolId] || toolId;
}

interface ChatViewProps {
  messages: TypedUIMessage[];
  error?: Error | null;
}

/**
 * Checks if a part is a data_connector ask_to_connect call
 */
function isDataConnectorAskToConnect(part: any): boolean {
  return part?.type === `tool-${DATA_CONNECTOR_TOOL_NAME}` &&
         part?.input?.operation === ASK_TO_CONNECT_OPERATION &&
         part?.input?.connectorId;
}

/**
 * Checks if a part has empty content and should not be rendered
 */
function isPartEmpty(part: any): boolean {
  switch (part.type) {
  case "text":
  case "reasoning":
    return !part.text || part.text.trim() === "";
  case "code":
    return !part.code || part.code.trim() === "";
  case "file":
    return !part.data && !part.url;
  case "source":
    return !part.source;
  case "tool-invocation":
    return !part.toolInvocation;
  default:
    if (isDataConnectorAskToConnect(part)) {
      return !part.input?.connectorId;
    }
    return false; // Don't skip unknown types by default
  }
}

function renderPartContent(part: any) {
  switch (part.type) {
  case "text":
    return (
      <ReactMarkdown>{part.text}</ReactMarkdown>
    );
  case "code":
    return (
      <Code block>
        {part.code}
      </Code>
    );
  case "file":
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>File (MIME): {part.mediaType}</Text>
        {part.mediaType?.startsWith("image/") ? (
          <Image
            src={part.url || part.data}
            alt="Generated image"
            fit="contain"
            style={{ maxWidth: "100%", height: "auto" }}
          />
        ) : (
          <Code block>
            {part.data}
          </Code>
        )}
      </Stack>
    );
  case "reasoning":
    return (
      <Box
        style={{
          opacity: 0.6,
          fontSize: "0.85em"
        }}
      >
        <ReactMarkdown>{part.text}</ReactMarkdown>
      </Box>
    );
  case "source":
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>Source</Text>
        <Code block>
          {JSON.stringify(part.source, null, 2)}
        </Code>
      </Stack>
    );
  case "tool-invocation": {
    const toolInvocation = part.toolInvocation;
    const hasImage = toolInvocation?.result?.imageBase64;
    
    return (
      <Stack gap="xs">
        {hasImage && (
          <Paper p="xs" withBorder>
            <Image
              src={`data:image/png;base64,${toolInvocation.result.imageBase64}`}
              alt="Tool result preview"
              fit="contain"
              style={{ maxHeight: "300px" }}
            />
          </Paper>
        )}
        <Paper p="xs" withBorder>
          <Code block>
            {JSON.stringify(toolInvocation, null, 2)}
          </Code>
        </Paper>
      </Stack>
    );
  }
  default:
    // Special handling for data_connector ask_to_connect calls
    if (isDataConnectorAskToConnect(part)) {
      const connectorId = part.state === "input-available" ? part.input.connectorId : "";
      return (
        <Stack gap="xs">
          <DataConnectButton connectorId={connectorId} />
        </Stack>
      );
    }
    
    return (
      <Code block>
        {JSON.stringify(part, null, 2)}
      </Code>
    );
  }
}

export function ChatView({ messages, error }: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const togglePart = (partId: string) => {
    setExpandedParts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(partId)) {
        newSet.delete(partId);
      } else {
        newSet.add(partId);
      }
      return newSet;
    });
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScrollPositionChange = useCallback((_position: { x: number; y: number }) => {
    if (!scrollAreaRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    const isAtBottomNow = scrollTop + clientHeight >= scrollHeight - 10; // 10px tolerance
    setIsAtBottom(isAtBottomNow);
  }, []);

  const handleUserInteraction = useCallback(() => {
    setIsUserInteracting(true);
  }, []);

  useEffect(() => {
    // Only auto-scroll if user is not interacting and we're at the bottom
    if (!isUserInteracting && isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isUserInteracting, isAtBottom, scrollToBottom]);

  // Reset user interaction state when messages change (new messages arrive)
  useEffect(() => {
    setIsUserInteracting(false);
  }, [messages.length]);

  return (
    <Container size="md" h="100%" p={0}>
      <Stack h="100%">
        <ScrollArea 
          ref={scrollAreaRef}
          flex={1} 
          type="scroll"
          onScrollPositionChange={handleScrollPositionChange}
          onMouseDown={handleUserInteraction}
          onTouchStart={handleUserInteraction}
          onWheel={handleUserInteraction}
        >
          <Stack gap="md" p="md">
            {messages.map((message) => (
              <Box key={message.id}>
                {message.role === "user" && (
                  <Group justify="flex-start">
                    <Paper
                      px="md"
                      py={0}
                      radius="lg"
                      withBorder={false}
                      style={{
                        fontWeight: 600,
                        backgroundColor: "var(--mantine-color-orange-2)",
                      }}
                    >
                      <Box style={{ whiteSpace: "pre-wrap" }}>
                        {message.parts?.map((part: any, i: number) => {
                          if (isPartEmpty(part)) return null;
                          return (
                            <Box key={`part-${i}`}>
                              {renderPartContent(part)}
                            </Box>
                          );
                        })}
                      </Box>
                    </Paper>
                  </Group>
                )}
                {message.role === "assistant" && (
                  <Group justify="flex-start" align="flex-start">
                    <Stack gap="md" style={{ width: "100%" }}>
                      {/* Render all parts in order, excluding step-start and empty parts */}
                      {message.parts?.map((part: any, originalIndex: number) => {
                        if (part.type === "step-start") return null;
                        if (isPartEmpty(part)) return null;
                        
                        const partId = `${message.id}-part-${originalIndex}`;
                        const isExpanded = expandedParts.has(partId);
                        
                        if (part.type === "text" || part.type === "reasoning" || (part.type === "file" && part.mediaType?.startsWith("image/")) || isDataConnectorAskToConnect(part)) {
                          // Render text parts, reasoning, image files, and data_connector ask_to_connect directly without collapsible headers
                          return (
                            <Box key={`part-${originalIndex}`}>
                              {renderPartContent(part)}
                            </Box>
                          );
                        } else {
                          // Get display name for the part
                          let displayName: string = part.type;
                          if (part.type === "tool-invocation" && part.toolInvocation?.toolId) {
                            // In v5, toolName was replaced with toolId 
                            // Convert tool ID to human-friendly message
                            displayName = part.toolInvocation.toolId;
                          }
                          displayName = getToolDisplayMessage(displayName);
                          
                          // Render non-text parts with clickable headers
                          return (
                            <Box key={`part-${originalIndex}`}>
                              <Text 
                                size="xs"
                                c="dimmed" 
                                tt="capitalize" 
                                style={{ 
                                  cursor: "pointer",
                                  opacity: 0.7
                                }}
                                onClick={() => togglePart(partId)}
                              >
                                {isExpanded ? "▼" : "▶"} {displayName}
                              </Text>
                              {isExpanded && (
                                <Box mb="sm">
                                  {renderPartContent(part)}
                                </Box>
                              )}
                            </Box>
                          );
                        }
                      })}
                      
                      {/* Display generation time at the end of assistant messages */}
                      {message.metadata?.startedAt && message.metadata?.finishedAt && (
                        <Group gap="xs" style={{ alignSelf: "flex-end" }}>
                          <IconClock size={14} style={{ opacity: 0.5 }} />
                          <Text size="xs" c="dimmed">
                            Generated in {((message.metadata.finishedAt - message.metadata.startedAt) / 1000).toFixed(2)}s
                          </Text>
                        </Group>
                      )}
                    </Stack>
                  </Group>
                )}
              </Box>
            ))}
            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Error"
                color="red"
                variant="light"
                style={{ maxWidth: "100%", wordBreak: "break-word" }}
              >
                <Text 
                  size="sm" 
                  style={{ 
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}
                >
                  {error.message || "An error occurred while processing your request."}
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  color="red"
                  leftSection={<IconExternalLink size={14} />}
                  onClick={() => setIsErrorModalOpen(true)}
                >
                  View Full Error
                </Button>
              </Alert>
            )}
            <Box ref={messagesEndRef} />
          </Stack>
        </ScrollArea>
      </Stack>
      
      {/* Error Details Modal */}
      <Modal
        opened={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        title="Error Details"
        size="lg"
        centered
      >
        <Box style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
          <Text size="sm">
            {error?.message || "An error occurred while processing your request."}
          </Text>
        </Box>
      </Modal>
    </Container>
  );
}