import { Paper, Stack, Group, Box, Accordion } from "@mantine/core";

interface Message {
  id: string;
  role: "data" | "assistant" | "user" | "system";
  content: string;
  parts?: any[];
  annotations?: any[];
}

interface AiDebugViewProps {
  messages: Message[];
  error?: Error;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export function AiDebugView({ messages, error, messagesEndRef }: AiDebugViewProps) {
  return (
    <Paper w="480px">
      <Stack h={"calc(100vh - 60px)"} gap="md" p="lg" style={{ overflow: "auto" }} align="center">
        {messages.map((message, index) => (
          <Box w="100%" key={message.id}>
            {message.role === "user" && (
              <Group justify="flex-end">
                <Paper
                  p="md"
                  radius="lg"
                  style={{
                    backgroundColor: "var(--mantine-color-blue-1)"
                  }}
                >
                  {message.content}
                </Paper>
              </Group>
            )}
            {message.role === "assistant" && (
              <Stack>
                <Accordion variant="contained">
                  {message.parts?.map((part, i) => (
                    <Accordion.Item key={`message-${index}-part-${i}`} value={`message-${index}-part-${i}`}>
                      <Accordion.Control>{part.type}</Accordion.Control>
                      <Accordion.Panel>
                        <pre style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(part, null, 2)}</pre>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                  {message.annotations?.map((annotation, i) => (
                    <Accordion.Item
                      key={`message-${index}-annotation-${i}`}
                      value={`message-${index}-annotation-${i}`}
                    >
                      <Accordion.Control>{(annotation as any).type}</Accordion.Control>
                      <Accordion.Panel>
                        <pre style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(annotation, null, 2)}</pre>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </Stack>
            )}
          </Box>
        ))}
        {error && (
          <p>Error: {error.message}</p>
        )}
        <div ref={messagesEndRef} />
      </Stack>
    </Paper>
  );
} 