"use client";

import { UseChatHelpers, UIMessage } from "@ai-sdk/react";
import { ActionIcon, Box, Group, Paper, Stack, Textarea } from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useTranslations } from "next-intl";

interface AgentInputProps<T extends UIMessage = UIMessage> {
  useChatHelpers: UseChatHelpers<T>;
}

export const AgentInput = <T extends UIMessage = UIMessage>({ useChatHelpers }: AgentInputProps<T>) => {
  const { sendMessage, status, stop } = useChatHelpers;
  const [input, setInput] = useState("");
  const t = useTranslations();

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const submit = (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!input?.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

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
            placeholder={t("Type your message...")}
            style={{ flex: 1, outline: "none" }}
            size="md"
            onKeyUp={(e) => {
              if (e.key === "Enter" && !e.shiftKey && input?.trim()) {
                e.preventDefault();
                submit();
              }
            }}
            variant="unstyled"
          />
          <Group>
            <Box style={{flexGrow: 1}} />
            {(status === "submitted" || status === "streaming") && (
              <ActionIcon size="lg" radius="xl" variant="default" onClick={stop}>
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
