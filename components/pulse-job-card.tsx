"use client";

import {
  Paper,
  Stack,
  Group,
  Text,
  Badge,
  Alert,
  Loader,
  Box,
  ActionIcon,
  Button
} from "@mantine/core";
import {
  IconCheck,
  IconX,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconExternalLink
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { ChatView } from "@/components/chat-view";
import type { PulseJobEntity } from "@/lib/entities";
import type { TypedUIMessage } from "@/lib/types";

interface PulseJobCardProps {
  initialJob: PulseJobEntity;
  pulseConfigId: string;
}

export function PulseJobCard({ initialJob, pulseConfigId: _pulseConfigId }: PulseJobCardProps) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const hasMessages = job.output && job.output.messages && job.output.messages.length > 0;
  const hasReportBundle = job.output && job.output.reportBundleId;
  const isFinished = job.state === "finished";

  // Calculate job duration
  const getDuration = () => {
    if (!job.startedAt) return null;
    
    const start = new Date(job.startedAt);
    const end = job.finishedAt ? new Date(job.finishedAt) : currentTime;
    const durationMs = end.getTime() - start.getTime();
    
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Auto-refresh job status if not finished
  useEffect(() => {
    if (isFinished) return;

    const intervalId = setInterval(async () => {
      const response = await fetch(`/api/pulse-job/${job.id}`);
      if (response.ok) {
        const updatedJob = await response.json();
        setJob(updatedJob);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(intervalId);
  }, [job.id, isFinished]);

  // Update current time for running jobs
  useEffect(() => {
    if (job.state !== "running") return;

    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second

    return () => clearInterval(intervalId);
  }, [job.state]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Convert job messages to TypedUIMessage format for ChatView
  const convertMessagesToUIMessages = (): TypedUIMessage[] => {
    if (!job.output?.messages) return [];
    
    return job.output.messages.map((msg, idx) => ({
      id: `${job.id}-msg-${idx}`,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      parts: msg.parts || [
        {
          type: "text" as const,
          text: msg.content,
        },
      ],
    }));
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        {/* Job Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="sm" align="flex-start">
            {/* Status Icon */}
            {job.state === "finished" && job.result === "success" && (
              <IconCheck size={20} color="var(--mantine-color-green-6)" style={{ marginTop: 2 }} />
            )}
            {job.state === "finished" && job.result === "error" && (
              <IconX size={20} color="var(--mantine-color-red-6)" style={{ marginTop: 2 }} />
            )}
            {job.state === "finished" && job.result === "canceled" && (
              <IconAlertCircle size={20} color="var(--mantine-color-yellow-6)" style={{ marginTop: 2 }} />
            )}
            {job.state === "running" && <Loader size="sm" style={{ marginTop: 2 }} />}

            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {new Date(job.createdAt).toLocaleString()}
              </Text>
              <Group gap="xs">
                <Badge
                  size="sm"
                  color={
                    job.state === "finished" && job.result === "success"
                      ? "green"
                      : job.state === "finished" && job.result === "error"
                        ? "red"
                        : job.state === "running"
                          ? "blue"
                          : "gray"
                  }
                >
                  {job.state === "finished" ? job.result : job.state}
                </Badge>
                {getDuration() && (
                  <Badge size="sm" variant="light" color="gray">
                    {getDuration()}
                  </Badge>
                )}
              </Group>
            </Stack>
          </Group>

          {/* Action Buttons */}
          <Group gap="xs">
            {hasReportBundle && (
              <Button
                size="xs"
                variant="light"
                color="blue"
                leftSection={<IconExternalLink size={14} />}
                onClick={() => router.push(`/report/${job.output?.reportBundleId}`)}
              >
                View Report
              </Button>
            )}
            {hasMessages && (
              <ActionIcon
                variant="subtle"
                onClick={toggleExpanded}
              >
                {isExpanded ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
              </ActionIcon>
            )}
          </Group>
        </Group>

        {/* Error Message */}
        {job.error && (
          <Alert color="red" icon={<IconAlertCircle size="1rem" />}>
            {job.error}
          </Alert>
        )}

        {/* Messages Section */}
        {isExpanded && hasMessages && (
          <Box>
            <Paper p="md" withBorder style={{ backgroundColor: "var(--mantine-color-gray-0)" }}>
              <ChatView messages={convertMessagesToUIMessages()} />
            </Paper>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

