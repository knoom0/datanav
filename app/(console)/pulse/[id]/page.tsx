"use client";

import {
  Container,
  Stack,
  Group,
  Text,
  Button,
  Paper,
  Title,
  Alert,
  Loader,
  Anchor,
  Breadcrumbs
} from "@mantine/core";
import {
  IconClock,
  IconAlertCircle,
  IconPlayerPlay,
  IconChevronRight
} from "@tabler/icons-react";
import { useState, useEffect, use } from "react";

import { useAppTitle } from "@/components/app-title-context";
import { PulseJobCard } from "@/components/pulse-job-card";
import type { PulseConfig, PulseJobEntity } from "@/lib/entities";

interface PulseDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function PulseDetailPage({ params }: PulseDetailPageProps) {
  const { id } = use(params);
  const { setTitle } = useAppTitle();

  const [config, setConfig] = useState<PulseConfig | null>(null);
  const [jobs, setJobs] = useState<PulseJobEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    // Fetch pulse config
    const configResponse = await fetch(`/api/pulse/${id}`);
    if (!configResponse.ok) {
      setError(`Failed to load pulse: ${configResponse.statusText}`);
      setLoading(false);
      return;
    }

    const configData = await configResponse.json();
    setConfig(configData);
    setTitle("Pulse");

    // Fetch jobs
    const jobsResponse = await fetch(`/api/pulse/${id}/jobs`);
    if (!jobsResponse.ok) {
      setError(`Failed to load jobs: ${jobsResponse.statusText}`);
      setLoading(false);
      return;
    }

    const jobsData = await jobsResponse.json();
    setJobs(jobsData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleRunNow = async () => {
    setIsRunning(true);
    setError(null);
    const response = await fetch(`/api/pulse/${id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    setIsRunning(false);

    if (response.ok) {
      // Refresh to show the new job
      await loadData();
    } else {
      let errorMessage = response.statusText;
      const errorData = await response.json().catch(() => null);
      if (errorData?.message) {
        errorMessage = errorData.message;
      }
      setError(`Failed to run pulse: ${errorMessage}`);
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Group justify="center" py="xl">
          <Loader size="lg" />
          <Text>Loading pulse details...</Text>
        </Group>
      </Container>
    );
  }

  if (error || !config) {
    return (
      <Container size="xl" py="md">
        <Alert icon={<IconAlertCircle size="1rem" />} color="red" title="Error">
          {error || "Pulse not found"}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Breadcrumb Navigation */}
        <Breadcrumbs separator={<IconChevronRight size={14} />}>
          <Anchor href="/" c="dimmed" size="sm">
            DataNav
          </Anchor>
          <Anchor href="/pulse" c="dimmed" size="sm">
            Pulse
          </Anchor>
          <Text size="sm" fw={500}>
            {config.name}
          </Text>
        </Breadcrumbs>

        {/* Error Alert */}
        {error && (
          <Alert icon={<IconAlertCircle size="1rem" />} color="red" title="Error">
            {error}
          </Alert>
        )}

        {/* Runs Section */}
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={2}>{config.name}</Title>
            <Button
              variant="light"
              color="orange"
              leftSection={<IconPlayerPlay size={16} />}
              onClick={handleRunNow}
              loading={isRunning}
              disabled={isRunning}
            >
              Run Now
            </Button>
          </Group>

          <Group justify="space-between" align="center">
            <Title order={3}>Runs</Title>
            <Text size="sm" c="dimmed">
              {jobs.length} run{jobs.length !== 1 ? "s" : ""}
            </Text>
          </Group>

          {jobs.length === 0 ? (
            <Paper p="xl" ta="center" withBorder>
              <IconClock size={48} style={{ opacity: 0.3, margin: "0 auto" }} />
              <Text size="lg" c="dimmed" mt="md">
                No runs yet
              </Text>
              <Text size="sm" c="dimmed" mt="xs">
                Runs will appear here after the pulse executes.
              </Text>
            </Paper>
          ) : (
            <Stack gap="sm">
              {jobs.map((job) => (
                <PulseJobCard
                  key={job.id}
                  initialJob={job}
                  pulseConfigId={config.id}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}

