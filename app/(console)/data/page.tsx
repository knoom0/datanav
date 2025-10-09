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
import { IconSearch, IconRefresh, IconAlertCircle, IconDatabase } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import { useAppTitle } from "@/components/app-title-context";
import { DataConnectButton } from "@/components/data-connect-button";
import logger from "@/lib/logger";

// Force dynamic rendering
export const dynamic = "force-dynamic";

interface DataConnectorInfo {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  isLoading: boolean;
  lastLoadedAt: Date | null;
}

export default function DataPage() {
  const { setTitle } = useAppTitle();
  const [connectors, setConnectors] = useState<DataConnectorInfo[]>([]);
  const [filteredConnectors, setFilteredConnectors] = useState<DataConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Load all connectors
  const loadConnectors = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/data");
      if (!response.ok) {
        throw new Error(`Failed to load connectors: ${response.statusText}`);
      }

      const data = await response.json();
      setConnectors(data.connectors);
      setFilteredConnectors(data.connectors);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
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

  // Handle connector connect/disconnect events
  const handleConnectorUpdate = () => {
    // Reload connectors to get updated status
    loadConnectors();
  };

  // Apply filters when dependencies change
  useEffect(() => {
    filterConnectors();
  }, [connectors, searchQuery, statusFilter]);

  // Set page title and load connectors on mount
  useEffect(() => {
    setTitle("Data Connectors");
    loadConnectors();
  }, [setTitle]);

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Group justify="center" py="xl">
          <Loader size="lg" />
          <Text>Loading data connectors...</Text>
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
          <Group justify="flex-end">
            <Text c="dimmed">
              {filteredConnectors.length} connector{filteredConnectors.length !== 1 ? "s" : ""}
              {filteredConnectors.length !== connectors.length && (
                <Text span c="dimmed" size="sm"> of {connectors.length} total</Text>
              )}
            </Text>
          </Group>

        {/* Search and Filter Controls */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group grow>
              <TextInput
                placeholder="Search connectors by name, description, or ID..."
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
                placeholder="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                data={[
                  { value: "connected", label: "Connected" },
                  { value: "disconnected", label: "Disconnected" }
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
                Search
              </Button>
              <Button 
                variant="light" 
                onClick={handleReset}
                leftSection={<IconRefresh size={16} />}
              >
                Reset
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* Connectors List */}
        {filteredConnectors.length === 0 ? (
          <Paper p="xl" ta="center">
            <Text size="lg" c="dimmed">No data connectors found</Text>
            <Text size="sm" c="dimmed" mt="xs">
              {searchQuery || statusFilter 
                ? "Try adjusting your search criteria." 
                : "No data connectors are currently available."}
            </Text>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
            {filteredConnectors.map((connector) => (
              <DataConnectButton
                key={connector.id}
                connectorId={connector.id}
                onConnectComplete={handleConnectorUpdate}
                onError={(error) => {
                  logger.error(`Connector error: ${error}`);
                }}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
