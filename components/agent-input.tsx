"use client";

import { ActionIcon, Box, Group, Paper, Stack, Textarea } from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import React, { useState } from "react";

import { ChatStatus } from "@/lib/types";

export type { ChatStatus };

interface AgentInputProps {
  onSubmit: (params: { text: string }) => void;
  onStop: () => void;
  status: ChatStatus;
  placeholder?: string;
}

export const AgentInput = ({ onSubmit, onStop, status, placeholder = "Type your prompt..." }: AgentInputProps) => {
  const [input, setInput] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const submit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!input?.trim()) return;
    onSubmit({ text: input });
    setInput("");
  };

  const isDisabled = status === "submitted";

  return (
    <Paper mx={0} my="sm" px="lg" py="xs" radius="lg" shadow="xs" withBorder>
      <form onSubmit={submit}>
        <Stack gap="0">
          <Textarea 
            autosize
            minRows={1}
            maxRows={4}
            value={input}
            onChange={handleInputChange}
            placeholder={placeholder}
            style={{ flex: 1, outline: "none" }}
            size="md"
            onKeyUp={(e) => {
              if (e.key === "Enter" && !e.shiftKey && input?.trim()) {
                e.preventDefault();
                submit();
              }
            }}
            variant="unstyled"
            readOnly={isDisabled}
            styles={{
              input: {
                cursor: isDisabled ? "default" : "text"
              }
            }}
          />
          <Group>
            <Box style={{flexGrow: 1}} />
            {(status === "submitted" || status === "streaming") && (
              <ActionIcon size="lg" radius="xl" variant="default" onClick={onStop}>
                <IconPlayerStop />
              </ActionIcon>
            )}
            {(status === "ready" || status === "error") && (
              <ActionIcon type="submit" size="lg" radius="xl" variant="default">
                <IconPlayerPlay />
              </ActionIcon>
            )}
          </Group>
        </Stack>
      </form>
    </Paper>
  );
};

export default AgentInput;
