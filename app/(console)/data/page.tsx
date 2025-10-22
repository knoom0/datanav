"use client";

import {
  Container,
  Stack,
  Group,
  Text, 
  TextInput, 
  Select, 
  Button, 
  Paper,
  SimpleGrid,
  Alert,
  Loader
} from "@mantine/core";
import { IconSearch, IconRefresh, IconAlertCircle, IconDatabase, IconPlus } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import { useFormatter, useTranslations } from "next-intl";

import { AddDataConnectorModal } from "@/components/add-data-connector-modal";
import { useAppTitle } from "@/components/app-title-context";
import { DataConnectButton } from "@/components/data-connect-button";

// Force dynamic rendering
export const dynamic = "force-dynamic";

interface DataConnectorInfo {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  isLoading: boolean;
  lastSyncedAt: Date | null;
}

export default function DataPage() {
  const { setTitle } = useAppTitle();
  const [connectors, setConnectors] = useState<DataConnectorInfo[]>([]);
  const [filteredConnectors, setFilteredConnectors] = useState<DataConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const t = useTranslations();
  const format = useFormatter();
  const filteredCount = filteredConnectors.length;
  const totalCount = connectors.length;
  const connectorSummary = filteredCount === 1
    ? t("{{count}} connector", { count: format.number(filteredCount) })
    : t("{{count}} connectors", { count: format.number(filteredCount) });

  // Load all connectors
  const loadConnectors = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/data");
      if (!response.ok) {
        throw new Error(t("Failed to load connectors: {{status}}", { status: response.statusText }));
      }

      const data = await response.json();
      setConnectors(data.connectors);
      setFilteredConnectors(data.connectors);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("Unknown error occurred");
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Filter connectors based on search and status
  const filterConnectors = () => {
    let filtered = [...connectors];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(connector => 
        connector.name.toLowerCase().includes(query) ||
        connector.description.toLowerCase().includes(query) ||
        connector.id.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter) {
      if (statusFilter === "connected") {
        filtered = filtered.filter(connector => connector.isConnected);
      } else if (statusFilter === "disconnected") {
        filtered = filtered.filter(connector => !connector.isConnected);
      }
    }

    setFilteredConnectors(filtered);
  };

  // Handle search input change
  const handleSearch = () => {
    filterConnectors();
  };

  // Handle reset filters
  const handleReset = () => {
    setSearchQuery("");
    setStatusFilter(null);
    setFilteredConnectors(connectors);
  };

  // Apply filters when dependencies change
  useEffect(() => {
    filterConnectors();
  }, [connectors, searchQuery, statusFilter]);

  // Cleanup stale jobs
  const cleanupStaleJobs = async () => {
    try {
      await fetch("/api/data-job/cleanup", { method: "POST" });
    } catch (err) {
      // Silently fail - cleanup is not critical for page functionality
      console.error("Failed to cleanup stale jobs:", err);
    }
  };

  // Set page title and load connectors on mount
  useEffect(() => {
    setTitle(t("Data Connectors"));
    loadConnectors();
    cleanupStaleJobs();
  }, [setTitle, t]);

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Group justify="center" py="xl">
          <Loader size="lg" />
          <Text>{t("Loading data connectors...")}</Text>
        </Group>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="md">
        <Alert icon={<IconAlertCircle size="1rem" />} color="red" title={t("Error")}>
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
        <Stack gap="lg">
          <Group justify="space-between">
            <Button
              leftSection={<IconPlus size="1rem" />}
              onClick={() => setAddModalOpen(true)}
            >
              {t("Add Connector")}
            </Button>
            <Text c="dimmed">
              {connectorSummary}
              {filteredCount !== totalCount && (
                <Text span c="dimmed" size="sm"> {t("of {{total}} total", { total: format.number(totalCount) })}</Text>
              )}
            </Text>
          </Group>

        {/* Search and Filter Controls */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group grow>
              <TextInput
                placeholder={t("Search connectors by name, description, or ID...")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
              />
              <Select
                placeholder={t("Filter by status")}
                value={statusFilter}
                onChange={setStatusFilter}
                data={[
                  { value: "connected", label: t("Connected") },
                  { value: "disconnected", label: t("Disconnected") }
                ]}
                leftSection={<IconDatabase size={16} />}
                clearable
              />
            </Group>
            <Group>
              <Button
                onClick={handleSearch}
                leftSection={<IconSearch size={16} />}
              >
                {t("Search")}
              </Button>
              <Button
                variant="light"
                onClick={handleReset}
                leftSection={<IconRefresh size={16} />}
              >
                {t("Reset")}
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* Connectors List */}
        {filteredConnectors.length === 0 ? (
          <Paper p="xl" ta="center">
            <Text size="lg" c="dimmed">{t("No data connectors found")}</Text>
            <Text size="sm" c="dimmed" mt="xs">
              {searchQuery || statusFilter
                ? t("Try adjusting your search criteria.")
                : t("No data connectors are currently available.")}
            </Text>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
            {filteredConnectors.map((connector) => (
              <DataConnectButton
                key={connector.id}
                connectorId={connector.id}
                onDelete={() => {
                  // Reload connectors after deletion
                  loadConnectors();
                }}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <AddDataConnectorModal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          // Reload connectors after successful add
          loadConnectors();
        }}
      />
    </Container>
  );
}
