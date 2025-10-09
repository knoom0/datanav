"use client";

import { Button, Paper, Text, Group, Stack, Badge, Loader, Alert, Menu, Modal } from "@mantine/core";
import { IconPlug, IconPlugConnected, IconAlertCircle, IconClock, IconRefresh, IconDots, IconTrash } from "@tabler/icons-react";
import { useState, useEffect } from "react";

const OAUTH_WINDOW_WIDTH = 500;
const OAUTH_WINDOW_HEIGHT = 600;

// Helper function to detect mobile devices
const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

type DataConnectorState = "idle" | "loading" | "connecting" | "manualLoading" | "disconnecting";

interface DataConnectorInfo {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  isLoading: boolean;
  lastLoadedAt: Date | null;
}

interface DataConnectButtonProps {
  connectorId: string;
  onConnectStart?: () => void;
  onConnectComplete?: (result: any) => void;
  onError?: (error: string) => void;
  onManualLoad?: () => void;
}

export function DataConnectButton({ 
  connectorId, 
  onConnectStart, 
  onConnectComplete, 
  onError,
  onManualLoad 
}: DataConnectButtonProps) {
  const [connector, setConnector] = useState<DataConnectorInfo | null>(null);
  const [mode, setMode] = useState<DataConnectorState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);

  // Fetch connector information
  useEffect(() => {
    const fetchConnectorInfo = async () => {
      setMode("loading");
      setError(null);
      
      const response = await fetch(`/api/data/${connectorId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        setError(`Failed to load connector: ${errorText}`);
        onError?.(errorText);
        setMode("idle");
        return;
      }
      
      const data = await response.json();
      setConnector(data);
      setMode("idle");
    };

    if (connectorId) {
      fetchConnectorInfo();
    }
  }, [connectorId, onError]);

  // Handle OAuth window communication (desktop only)
  const handleOAuthCallback = async (authCode: string) => {
    setMode("connecting");
    setError(null);

    const response = await fetch(`/api/data/${connectorId}/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authCode }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      setError(`Authentication failed: ${errorText}`);
      onError?.(errorText);
      setMode("idle");
      return;
    }

    const result = await response.json();
    setMode("idle");
    onConnectComplete?.(result);

    // Refresh connector info after connection attempt
    const refreshResponse = await fetch(`/api/data/${connectorId}`);
    if (refreshResponse.ok) {
      const refreshedData = await refreshResponse.json();
      setConnector(refreshedData);
    }
  };

  // Handle manual load button click
  const handleManualLoad = async () => {
    if (!connector || !connector.isConnected || mode === "manualLoading" || connector.isLoading) return;

    setMode("manualLoading");
    setError(null);
    onManualLoad?.();

    const response = await fetch(`/api/data/${connectorId}/load`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      setError(`Load failed: ${errorText}`);
      onError?.(errorText);
      setMode("idle");
      return;
    }

    const result = await response.json();
    setMode("idle");
    
    // Refresh connector info to get updated lastLoadedAt and isLoading state
    const refreshResponse = await fetch(`/api/data/${connectorId}`);
    if (refreshResponse.ok) {
      const refreshedData = await refreshResponse.json();
      setConnector(refreshedData);
    }

    // Optionally call success callback with result
    onConnectComplete?.(result);
  };

  // Handle disconnect button click
  const handleDisconnect = async () => {
    if (!connector || mode === "disconnecting") return;

    setMode("disconnecting");
    setError(null);

    const response = await fetch(`/api/data/${connectorId}/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      setError(`Disconnect failed: ${errorText}`);
      onError?.(errorText);
      setMode("idle");
      return;
    }

    setMode("idle");
    setDisconnectModalOpen(false);

    // Refresh connector info after disconnect
    const refreshResponse = await fetch(`/api/data/${connectorId}`);
    if (refreshResponse.ok) {
      const refreshedData = await refreshResponse.json();
      setConnector(refreshedData);
    }

    onConnectComplete?.({ success: true, disconnected: true });
  };

  // Handle connect button click
  const handleConnect = async () => {
    if (!connector || mode === "connecting") return;

    setMode("connecting");
    setError(null);
    onConnectStart?.();

    const response = await fetch(`/api/data/${connectorId}/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      setError(`Connection failed: ${errorText}`);
      onError?.(errorText);
      setMode("idle");
      return;
    }

    const result = await response.json();
    
    // Check if we need to handle OAuth flow
    if (!result.success && result.authInfo?.authUrl) {
      // On mobile devices, redirect to auth page instead of opening popup
      // The auth-callback page will handle completing the connection and redirecting back
      if (isMobileDevice()) {
        // Store connector ID and return URL for callback handling
        sessionStorage.setItem("oauth_connector_id", connectorId);
        sessionStorage.setItem("oauth_return_url", window.location.href);
        // Redirect to auth page
        window.location.href = result.authInfo.authUrl;
        return;
      }

      // Desktop: Open OAuth window
      const authWindow = window.open(
        result.authInfo.authUrl,
        "oauth",
        `width=${OAUTH_WINDOW_WIDTH},height=${OAUTH_WINDOW_HEIGHT},scrollbars=yes,resizable=yes`
      );

      if (!authWindow) {
        setError("Failed to open authentication window. Please allow popups for this site.");
        setMode("idle");
        return;
      }

      // Listen for OAuth callback
      const handleMessage = (event: MessageEvent) => {
        // Verify origin for security
        if (event.origin !== window.location.origin) return;

        if (event.data.type === "OAUTH_SUCCESS" && event.data.authCode) {
          window.removeEventListener("message", handleMessage);
          authWindow.close();
          handleOAuthCallback(event.data.authCode);
        } else if (event.data.type === "OAUTH_ERROR") {
          window.removeEventListener("message", handleMessage);
          authWindow.close();
          setError(event.data.error || "Authentication failed");
          setMode("idle");
        }
      };

      window.addEventListener("message", handleMessage);

      return;
    }

    // Direct connection success (no OAuth needed)
    setMode("idle");
    onConnectComplete?.(result);

    // Refresh connector info after connection attempt
    const refreshResponse = await fetch(`/api/data/${connectorId}`);
    if (refreshResponse.ok) {
      const refreshedData = await refreshResponse.json();
      setConnector(refreshedData);
    }
  };

  // Format last loaded date
  const formatLastLoaded = (date: Date | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (mode === "loading") {
    return (
      <Paper p="md" withBorder>
        <Group>
          <Loader size="sm" />
          <Text>Loading connector...</Text>
        </Group>
      </Paper>
    );
  }

  if (error && !connector) {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} color="red">
        {error}
      </Alert>
    );
  }

  if (!connector) {
    return (
      <Alert icon={<IconAlertCircle size="1rem" />} color="red">
        Connector not found
      </Alert>
    );
  }

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Stack gap="xs">
          <Group gap="xs" justify="space-between">
            <Text fw={500} size="lg">
              {connector.name}
            </Text>
            
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button
                  variant="subtle"
                  size="xs"
                  color="gray"
                  p="xs"
                >
                  <IconDots size="1rem" />
                </Button>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconPlug size="0.9rem" />}
                  onClick={handleConnect}
                  disabled={mode === "connecting"}
                >
                  {mode === "connecting" ? "Connecting..." : "Reconnect"}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size="0.9rem" />}
                  color="red"
                  onClick={() => setDisconnectModalOpen(true)}
                  disabled={!connector.isConnected}
                >
                  Disconnect
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
          
          <Badge
            color={connector.isLoading ? "blue" : connector.isConnected ? "green" : "gray"}
            variant="light"
            leftSection={
              connector.isLoading ? (
                <Loader size="0.8rem" />
              ) : connector.isConnected ? (
                <IconPlugConnected size="0.8rem" />
              ) : (
                <IconPlug size="0.8rem" />
              )
            }
          >
            {connector.isLoading ? "Loading..." : connector.isConnected ? "Connected" : "Not Connected"}
          </Badge>
          
          <Text size="sm" c="dimmed">
            {connector.description}
          </Text>
          
          <Group gap="xs" align="center">
            <IconClock size="0.9rem" style={{ color: "var(--mantine-color-dimmed)" }} />
            <Text size="xs" c="dimmed">
              Last loaded: {formatLastLoaded(connector.lastLoadedAt)}
            </Text>
          </Group>
        </Stack>

        {error && (
          <Alert icon={<IconAlertCircle size="1rem" />} color="red">
            {error}
          </Alert>
        )}

        <Group gap="xs" align="center" wrap="nowrap" justify="flex-end">
          {connector.isConnected && (
            <Button
              onClick={handleManualLoad}
              loading={mode === "manualLoading"}
              disabled={mode === "manualLoading" || connector.isLoading}
              leftSection={<IconRefresh size="1rem" />}
              variant="light"
              size="sm"
            >
              {mode === "manualLoading" ? "Loading..." : "Load Data"}
            </Button>
          )}
          {!connector.isConnected && (
            <Button
              onClick={handleConnect}
              loading={mode === "connecting"}
              disabled={mode === "connecting"}
              leftSection={<IconPlug size="1rem" />}
              variant="filled"
              size="sm"
            >
              {mode === "connecting" ? "Connecting..." : "Connect"}
            </Button>
          )}
        </Group>
      </Stack>

      <Modal
        opened={disconnectModalOpen}
        onClose={() => setDisconnectModalOpen(false)}
        title="Disconnect Data Source"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to disconnect <strong>{connector.name}</strong>?
          </Text>
          
          <Alert color="red" icon={<IconAlertCircle size="1rem" />}>
            <Text size="sm">
              This will permanently delete all loaded data for this connector and cannot be undone.
              You will need to reconnect and reload data to use this connector again.
            </Text>
          </Alert>

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={() => setDisconnectModalOpen(false)}
              disabled={mode === "disconnecting"}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDisconnect}
              loading={mode === "disconnecting"}
              leftSection={<IconTrash size="1rem" />}
            >
              {mode === "disconnecting" ? "Disconnecting..." : "Disconnect & Clear Data"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

export default DataConnectButton;
