"use client";

import { 
  Container, 
  Stack, 
  Group, 
  Text, 
  Button, 
  Paper,
  Alert,
  Loader,
  Title
} from "@mantine/core";
import { IconPlus, IconAlertCircle, IconClock } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import { AddPulseModal } from "@/components/add-pulse-modal";
import { useAppTitle } from "@/components/app-title-context";
import { PulseCard } from "@/components/pulse-card";
import type { PulseConfig } from "@/lib/entities";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default function PulsePage() {
  const { setTitle } = useAppTitle();
  const [configs, setConfigs] = useState<PulseConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Load all pulse configs
  const loadConfigs = async () => {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/pulse");
    if (!response.ok) {
      setError(`Failed to load pulse configs: ${response.statusText}`);
      setLoading(false);
      return;
    }

    const data = await response.json();
    setConfigs(data);
    setLoading(false);
  };

  // Set page title and load configs on mount
  useEffect(() => {
    setTitle("Pulse");
    loadConfigs();
  }, [setTitle]);

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Group justify="center" py="xl">
          <Loader size="lg" />
          <Text>Loading pulse configs...</Text>
        </Group>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="md">
        <Alert icon={<IconAlertCircle size="1rem" />} color="red" title="Error">
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Actions and Count */}
        <Group justify="space-between">
          <Button
            leftSection={<IconPlus size="1rem" />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create Pulse
          </Button>
          <Text c="dimmed">
            {configs.length} pulse{configs.length !== 1 ? "s" : ""}
          </Text>
        </Group>

        {/* Pulse Configs List */}
        {configs.length === 0 ? (
          <Paper p="xl" ta="center" withBorder>
            <Stack gap="md" align="center">
              <IconClock size={48} style={{ opacity: 0.3 }} />
              <Stack gap="sm" align="center">
                <Title order={3}>Pulse - Automated Reports on Your Schedule</Title>
                <Text c="dimmed" maw={600} ta="center">
                  Pulse automatically generates and delivers AI-powered reports based on your schedule. 
                  Define what insights you need, set when you want them, and Pulse will handle the rest—delivering 
                  intelligent reports directly to your inbox at the right time.
                </Text>
              </Stack>
              <Text size="sm" c="dimmed" mt="xs">
                Create your first pulse to start receiving automated reports.
              </Text>
            </Stack>
          </Paper>
        ) : (
          <Stack gap="md">
            {configs.map((config) => (
              <PulseCard key={config.id} config={config} onUpdate={loadConfigs} />
            ))}
          </Stack>
        )}

        <AddPulseModal
          opened={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => {
            // Reload configs after successful creation
            loadConfigs();
          }}
        />
      </Stack>
    </Container>
  );
}

