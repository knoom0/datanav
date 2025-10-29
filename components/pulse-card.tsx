"use client";

import { Paper, Stack, Group, Title, Button, Text, Switch } from "@mantine/core";
import { IconClock, IconEye, IconEdit } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditPulseModal } from "@/components/edit-pulse-modal";
import { ScheduleDisplay } from "@/components/schedule-display";
import type { PulseConfig } from "@/lib/entities";

interface PulseCardProps {
  config: PulseConfig;
  onUpdate: () => void;
}

export function PulseCard({ config, onUpdate }: PulseCardProps) {
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const formattedLastRun = config.lastRunAt 
    ? new Date(config.lastRunAt).toLocaleString()
    : "Never";
  
  const formattedNextRun = config.nextRunAt
    ? new Date(config.nextRunAt).toLocaleString()
    : "Not scheduled";

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsToggling(true);

    const response = await fetch(`/api/pulse/${config.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: config.name,
        description: config.description,
        prompt: config.prompt,
        cron: config.cron,
        cronTimezone: config.cronTimezone,
        enabled,
      }),
    });

    setIsToggling(false);

    if (response.ok) {
      // Refresh the config to update the enabled state
      onUpdate();
    } else {
      const errorData = await response.json();
      console.error("Failed to toggle pulse:", errorData);
      // TODO: Show error notification to user
    }
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between">
          <Title order={4}>{config.name}</Title>
          <Group gap="xs">
            <Switch
              checked={config.enabled}
              onChange={(event) => handleToggleEnabled(event.currentTarget.checked)}
              disabled={isToggling}
              label={config.enabled ? "Enabled" : "Disabled"}
            />
            <Button 
              size="xs" 
              variant="light"
              leftSection={<IconEye size={14} />}
              onClick={() => router.push(`/pulse/${config.id}`)}
            >
              View Runs
            </Button>
            <Button 
              size="xs" 
              variant="light"
              leftSection={<IconEdit size={14} />}
              onClick={() => setEditModalOpen(true)}
            >
              Edit
            </Button>
          </Group>
        </Group>

        {/* Description */}
        <Text size="sm" c="dimmed">
          {config.description}
        </Text>

        {/* Schedule Info */}
        <Group gap="xl">
          <Group gap="xs">
            <IconClock size={16} />
            <Text size="sm" c="dimmed">
              <ScheduleDisplay cron={config.cron} timezone={config.cronTimezone ?? undefined} />
            </Text>
          </Group>
        </Group>

        {/* Run Times */}
        <Group gap="xl">
          <Text size="xs" c="dimmed">
            Last run: <Text span fw={500}>{formattedLastRun}</Text>
          </Text>
          <Text size="xs" c="dimmed">
            Next run: <Text span fw={500}>{formattedNextRun}</Text>
          </Text>
        </Group>
      </Stack>

      <EditPulseModal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={onUpdate}
        config={config}
      />
    </Paper>
  );
}

