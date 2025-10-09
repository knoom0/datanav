import { Accordion, Stack, Text, Code, Paper, Image } from "@mantine/core";

interface MessageStepsProps {
  message: any;
  showStepStart?: boolean;
}

function renderPartContent(part: any) {
  switch (part.type) {
  case "text":
    return <Text>{part.text}</Text>;
  case "code":
    return (
      <Code block>
        {part.code}
      </Code>
    );
  case "file":
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>File (MIME): {part.file.mediaType}</Text>
        <Code block>
          {part.file.data}
        </Code>
      </Stack>
    );
  case "reasoning":
    return (<div style={{ whiteSpace: "pre-line" }}>{part.reasoningText || ""}</div>);
  case "source":
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>Source</Text>
        <pre style={{ margin: 0, overflowX: "auto" }}>{JSON.stringify(part.source, null, 2)}</pre>
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
          <pre style={{ margin: 0, overflowX: "auto" }}>{JSON.stringify(toolInvocation, null, 2)}</pre>
        </Paper>
      </Stack>
    );
  }
  default:
    return <pre style={{ overflowX: "auto", maxWidth: "100%" }}>{JSON.stringify(part, null, 2)}</pre>;
  }
}

export function MessageSteps({ message, showStepStart = false }: MessageStepsProps) {
  if (!message.parts || message.parts.length === 0) {
    return null;
  }

  const filteredParts = showStepStart 
    ? message.parts 
    : message.parts.filter((part: any) => part.type !== "step-start");

  return (
    <Stack>
      <Accordion variant="contained">
        {filteredParts.map((part: any, i: number) => (
          <Accordion.Item key={`message-part-${i}`} value={`message-part-${i}`}>
            <Accordion.Control>
              <Text size="sm" fw={500} tt="capitalize">{part.type}</Text>
            </Accordion.Control>
            <Accordion.Panel>
              {renderPartContent(part)}
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
} 