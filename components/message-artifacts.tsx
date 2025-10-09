import { Paper, Stack, Table, Tabs } from "@mantine/core";
import Image from "next/image";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MessageArtifactsProps {
  message: any;
}

interface Annotation {
  type: string;
  code?: string;
  imageBase64?: string;
  [key: string]: any;
}

function renderAnnotationContent(annotation: Annotation) {
  if (annotation.type === "query") {
    return (
      <Table>
        <Table.Tbody>
          {Object.entries(annotation).map(([key, value]) => (
            <Table.Tr key={key}>
              <Table.Td style={{ fontWeight: 500 }}>{key}</Table.Td>
              <Table.Td>
                {typeof value === "object" 
                  ? JSON.stringify(value, null, 2)
                  : String(value)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
  }

  if (annotation.type === "code") {
    return (
      <div style={{ maxHeight: 400, overflow: "auto", borderRadius: 8 }}>
        <SyntaxHighlighter language="javascript" style={prism} wrapLongLines>
          {annotation.code || "No code provided"}
        </SyntaxHighlighter>
      </div>
    );
  }

  if (annotation.type === "image") {
    return (
      <div style={{ maxWidth: "100%", display: "flex", justifyContent: "center" }}>
        <Image 
          src={`data:image/png;base64,${annotation.imageBase64}`}
          alt={annotation.alt || "Annotation image"} 
          width={400}
          height={400}
          style={{ 
            maxWidth: "100%", 
            maxHeight: "400px", 
            objectFit: "contain",
            borderRadius: "8px"
          }} 
        />
      </div>
    );
  }

  // Fallback for other types
  return (
    <pre style={{ overflowX: "auto", maxWidth: "100%" }}>
      {JSON.stringify(annotation, null, 2)}
    </pre>
  );
}

export function MessageArtifacts({ message }: MessageArtifactsProps) {
  if (!message.annotations?.length) {
    return null;
  }

  return (
    <Paper w="100%">
      <Stack>
        <Tabs defaultValue="0" variant="outline">
          <Tabs.List>
            {message.annotations?.map((annotation: any, i: number) => (
              <Tabs.Tab key={`tab-${i}`} value={i.toString()}>
                {(annotation as Annotation)?.type || "Annotation"}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {message.annotations?.map((annotation: any, i: number) => (
            annotation ? (
              <Tabs.Panel key={`panel-${i}`} value={i.toString()}>
                {renderAnnotationContent(annotation as Annotation)}
              </Tabs.Panel>
            ) : null
          ))}
        </Tabs>
      </Stack>
    </Paper>
  );
} 