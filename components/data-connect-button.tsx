"use client";

import { Button, Paper, Text, Group, Stack, Badge, Loader, Alert, Menu, Modal, ActionIcon, Code } from "@mantine/core";
import { IconPlug, IconPlugConnected, IconAlertCircle, IconClock, IconRefresh, IconDots, IconTrash, IconCheck, IconX, IconInfoCircle } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import { useFormatter, useTranslations } from "next-intl";

import { DataConnectorInfo, DataJobInfo } from "@/lib/types";

const OAUTH_WINDOW_WIDTH = 500;
const OAUTH_WINDOW_HEIGHT = 600;
const JOB_POLLING_INTERVAL_MS = 500;

// Helper function to detect mobile devices
const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

interface DataConnectButtonProps {
  connectorId: string;
  onConnectStart?: () => void;
  onConnectComplete?: (result: any) => void;
  onDelete?: () => void;
}

export function DataConnectButton({
  connectorId,
  onConnectStart,
  onConnectComplete,
  onDelete
}: DataConnectButtonProps) {
  const [connector, setConnector] = useState<DataConnectorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [errorDetailsModalOpen, setErrorDetailsModalOpen] = useState(false);
  const [jobInfo, setJobInfo] = useState<DataJobInfo | null>(null);

  // Single loading state for all button actions
  const [isHandlingAction, setIsHandlingAction] = useState(false);
  const t = useTranslations();
  const format = useFormatter();

  // Fetch connector information
  useEffect(() => {
    const fetchConnectorInfo = async () => {
      setError(null);
      
      const response = await fetch(`/api/data/${connectorId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        setError(t("Failed to load connector: {{error}}", { error: errorText }));
        return;
      }
      
      const data = await response.json();
      setConnector(data);
    };

    if (connectorId) {
      fetchConnectorInfo();
    }
  }, [connectorId]);

  // Poll connector status when we have an active job
  useEffect(() => {
    if (!connector?.dataJobId) return;

    const pollConnectorStatus = async () => {
      try {
        const response = await fetch(`/api/data/${connectorId}`);
        
        if (!response.ok) {
          throw new Error(t("Failed to fetch connector status: {{status}}", { status: response.statusText }));
        }
        
        const connectorData = await response.json();
        setConnector(connectorData);
        
        // If the dataJobId is null, the job has finished
        if (!connectorData.dataJobId) {
          setJobInfo(null);
        } else {
          // Still polling - get job info for status display
          try {
            const jobResponse = await fetch(`/api/data-job/${connectorData.dataJobId}`);
            if (jobResponse.ok) {
              const job = await jobResponse.json();
              setJobInfo(job);
            }
          } catch (jobError) {
            console.warn("Failed to fetch job info:", jobError);
            setJobInfo(null);
          }
        }
      } catch (error) {
        console.error("Failed to poll connector status:", error);
        setError(t("Failed to check connector status: {{error}}", { error: String(error) }));
        setJobInfo(null);
      }
    };

    // Poll immediately, then every 2 seconds
    pollConnectorStatus();
    const interval = setInterval(pollConnectorStatus, JOB_POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connector?.dataJobId, connectorId]);

  // Handle OAuth window communication (desktop only)
  const handleOAuthCallback = async (authCode: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/data/${connectorId}/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ authCode }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setError(t("Authentication failed: {{error}}", { error: errorText }));
        return;
      }

      await response.json();
      
      // Refresh connector info after connection attempt
      const refreshResponse = await fetch(`/api/data/${connectorId}`);
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setConnector(refreshedData);
      }
    } finally {
      setIsHandlingAction(false);
    }
  };

  // Handle manual load button click
  const handleLoadData = async () => {
    if (!connector || isHandlingAction) return;

    setIsHandlingAction(true);
    setError(null);

    try {
      const response = await fetch(`/api/data/${connectorId}/load`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setError(t("Load failed: {{error}}", { error: errorText }));
        return;
      }

      // Refresh connector info to get updated lastSyncedAt and isLoading state
      const refreshResponse = await fetch(`/api/data/${connectorId}`);
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setConnector(refreshedData);
      }
    } finally {
      setIsHandlingAction(false);
    }
  };

  // Handle disconnect button click
  const handleDisconnect = async () => {
    if (!connector || isHandlingAction) return;

    setIsHandlingAction(true);
    setError(null);

    try {
      const response = await fetch(`/api/data/${connectorId}/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setError(t("Disconnect failed: {{error}}", { error: errorText }));
        return;
      }

      setDisconnectModalOpen(false);

      // Refresh connector info after disconnect
      const refreshResponse = await fetch(`/api/data/${connectorId}`);
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setConnector(refreshedData);
      }
    } finally {
      setIsHandlingAction(false);
    }
  };

  // Handle delete button click
  const handleDelete = async () => {
    if (!connector || isHandlingAction || !connector.isRemovable) return;

    setIsHandlingAction(true);
    setError(null);

    try {
      const response = await fetch(`/api/data/${connectorId}/delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setError(t("Delete failed: {{error}}", { error: errorText }));
        return;
      }

      setDeleteModalOpen(false);

      // Call onDelete callback to refresh the connector list
      onDelete?.();
    } finally {
      setIsHandlingAction(false);
    }
  };

  // Handle connect button click
  const handleConnect = async () => {
    if (!connector || isHandlingAction) return;

    setIsHandlingAction(true);
    setError(null);

    // Call onConnectStart callback if provided
    onConnectStart?.();

    try {
      const response = await fetch(`/api/data/${connectorId}/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setError(t("Connection failed: {{error}}", { error: errorText }));
        return;
      }

      const result = await response.json();
      
      // Call onConnectComplete callback if provided
      onConnectComplete?.(result);
      
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
          setError(t("Failed to open authentication window. Please allow popups for this site."));
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
            setError(event.data.error || t("Authentication failed"));
            setIsHandlingAction(false);
          }
        };

        window.addEventListener("message", handleMessage);

        // Handle window closed without completion
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed);
            window.removeEventListener("message", handleMessage);
            setIsHandlingAction(false);
          }
        }, 1000);

        return;
      }

      // Direct connection success (no OAuth needed)
      // Refresh connector info after connection attempt
      const refreshResponse = await fetch(`/api/data/${connectorId}`);
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setConnector(refreshedData);
      }
    } finally {
      setIsHandlingAction(false);
    }
  };

  // Format last loaded date
  const formatLastLoaded = (date: Date | null) => {
    if (!date) return t("Never");
    return new Date(date).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Render last load result status
  const renderLastLoadStatus = () => {
    if (!connector) return null;
    const { lastDataJob } = connector;
    
    if (!lastDataJob) {
      return (
        <Group gap="xs" align="center">
          <IconClock size="0.9rem" style={{ color: "var(--mantine-color-dimmed)" }} />
          <Text size="xs" c="dimmed">
            {t("Never loaded")}
          </Text>
        </Group>
      );
    }

    const isSuccess = lastDataJob.result === "success";
    const isError = lastDataJob.result === "error";
    const isCanceled = lastDataJob.result === "canceled";

    // Calculate finished time
    const finishedAt = lastDataJob.state === "finished" && lastDataJob.runTimeMs 
      ? new Date(new Date(lastDataJob.createdAt).getTime() + lastDataJob.runTimeMs)
      : new Date(lastDataJob.updatedAt);

    return (
      <Stack gap={4}>
        <Group gap="xs" align="center">
          {isSuccess && <IconCheck size="0.9rem" style={{ color: "var(--mantine-color-green-6)" }} />}
          {isError && <IconX size="0.9rem" style={{ color: "var(--mantine-color-red-6)" }} />}
          {isCanceled && <IconAlertCircle size="0.9rem" style={{ color: "var(--mantine-color-yellow-6)" }} />}
          <Text size="xs" c={isSuccess ? "green" : isError ? "red" : "yellow"} fw={500}>
            {isSuccess
              ? t("Last load successful")
              : isError
                ? t("Last load failed")
                : t("Last load canceled")}
          </Text>
          {isError && lastDataJob.error && (
            <ActionIcon
              size="xs"
              variant="subtle"
              color="red"
              onClick={() => setErrorDetailsModalOpen(true)}
              aria-label={t("View error details")}
            >
              <IconInfoCircle size="0.9rem" />
            </ActionIcon>
          )}
        </Group>
        <Group gap="xs" align="center">
          <IconClock size="0.9rem" style={{ color: "var(--mantine-color-dimmed)" }} />
          <Text size="xs" c="dimmed">
            {formatLastLoaded(finishedAt)}
            {lastDataJob.progress?.updatedRecordCount !== undefined && 
              ` • ${formatRecordCount(lastDataJob.progress.updatedRecordCount)}`}
          </Text>
        </Group>
      </Stack>
    );
  };

  // Format job type for human-friendly display
  const formatJobType = (type: string) => {
    switch (type) {
    case "load":
        return t("Loading");
    default:
        return t(type.charAt(0).toUpperCase() + type.slice(1));
    }
  };

  // Format runtime for display
  const formatRunTime = (runTimeMs: number) => {
    if (runTimeMs < 1000) {
      return `${runTimeMs}ms`;
    } else if (runTimeMs < 60000) {
      return `${Math.round(runTimeMs / 1000)}s`;
    } else {
      const minutes = Math.floor(runTimeMs / 60000);
      const seconds = Math.round((runTimeMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  };

  // Format record count for display
  const formatRecordCount = (count: number) => {
    if (count === 0) return t("0 records");
    if (count === 1) return t("1 record");
    if (count < 1000) return t("{{count}} records", { count: format.number(count) });
    if (count < 1000000) {
      return t("{{count}}k records", { count: format.number(Math.round(count / 1000)) });
    }
    return t("{{count}}M records", { count: format.number(Math.round(count / 1000000)) });
  };

  if (!connector) {
    return (
      <Paper p="md" withBorder>
        <Group>
          <Loader size="sm" />
          <Text>{t("Loading connector...")}</Text>
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
        {t("Connector not found")}
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
                disabled={connector.isLoading || isHandlingAction}
              >
                {t("Reconnect")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTrash size="0.9rem" />}
                color="red"
                onClick={() => setDisconnectModalOpen(true)}
                disabled={!connector.isConnected || connector.isLoading || isHandlingAction}
              >
                {t("Disconnect")}
              </Menu.Item>
              {connector.isRemovable && (
                <Menu.Item
                  leftSection={<IconTrash size="0.9rem" />}
                  color="red"
                  onClick={() => setDeleteModalOpen(true)}
                  disabled={connector.isLoading || isHandlingAction}
                >
                  {t("Delete Connector")}
                </Menu.Item>
              )}
              </Menu.Dropdown>
            </Menu>
          </Group>
          
          <Badge
            color={
              connector.isLoading
                ? "blue" 
                : connector.isConnected 
                  ? "green" 
                  : "gray"
            }
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
            {connector.isLoading
              ? t("Loading...")
              : connector.isConnected
                ? t("Connected")
                : t("Not Connected")
            }
          </Badge>

          {/* Job Info */}
          {connector.isLoading && jobInfo && (
            <Stack gap="xs">
              <Group gap="xs" align="center">
                <Text size="sm" fw={500}>
                  {formatJobType(jobInfo.type || "unknown")} {t("Job")}
                </Text>
                {(jobInfo.progress?.updatedRecordCount !== undefined || 
                  (jobInfo.runTimeMs !== undefined && jobInfo.runTimeMs > 0)) && (
                  <Text size="sm" c="dimmed">
                    {jobInfo.progress?.updatedRecordCount !== undefined && 
                      `${formatRecordCount(jobInfo.progress.updatedRecordCount)}`}
                    {jobInfo.progress?.updatedRecordCount !== undefined && 
                      jobInfo.runTimeMs !== undefined && jobInfo.runTimeMs > 0 && " • "}
                    {jobInfo.runTimeMs !== undefined && jobInfo.runTimeMs > 0 && 
                      formatRunTime(jobInfo.runTimeMs)}
                  </Text>
                )}
              </Group>
            </Stack>
          )}
          
          <Text size="sm" c="dimmed">
            {connector.description}
          </Text>
          
          {renderLastLoadStatus()}
        </Stack>

        {error && (
          <Alert icon={<IconAlertCircle size="1rem" />} color="red">
            {error}
          </Alert>
        )}

        <Group gap="xs" align="center" wrap="nowrap" justify="flex-end">
          {connector.isConnected && (
            <Button
              onClick={handleLoadData}
              loading={connector.isLoading || isHandlingAction}
              disabled={connector.isLoading || isHandlingAction}
              leftSection={<IconRefresh size="1rem" />}
              variant="light"
              size="sm"
            >
              {t("Load Data")}
            </Button>
          )}
          {!connector.isConnected && (
            <Button
              onClick={handleConnect}
              loading={connector.isLoading || isHandlingAction}
              disabled={connector.isLoading || isHandlingAction}
              leftSection={<IconPlug size="1rem" />}
              variant="filled"
              size="sm"
            >
              {t("Connect")}
            </Button>
          )}
        </Group>
      </Stack>

      <Modal
        opened={disconnectModalOpen}
        onClose={() => setDisconnectModalOpen(false)}
        title={t("Disconnect Data Source")}
        centered
      >
        <Stack gap="md">
          <Text>
            {t("Are you sure you want to disconnect {{name}}?", { name: connector.name })}
          </Text>

          <Alert color="red" icon={<IconAlertCircle size="1rem" />}>
            <Text size="sm">
              {t("This will permanently delete all loaded data for this connector and cannot be undone. You will need to reconnect and reload data to use this connector again.")}
            </Text>
          </Alert>

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={() => setDisconnectModalOpen(false)}
              disabled={connector.isLoading || isHandlingAction}
            >
              {t("Cancel")}
            </Button>
            <Button
              color="red"
              onClick={handleDisconnect}
              loading={connector.isLoading || isHandlingAction}
              disabled={connector.isLoading || isHandlingAction}
              leftSection={<IconTrash size="1rem" />}
            >
              {t("Disconnect & Clear Data")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t("Delete Data Connector")}
        centered
      >
        <Stack gap="md">
          <Text>
            {t("Are you sure you want to permanently delete {{name}}?", { name: connector.name })}
          </Text>

          <Alert color="red" icon={<IconAlertCircle size="1rem" />}>
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t("This action cannot be undone!")}
              </Text>
              <Text size="sm">
                {t("This will:")}
              </Text>
              <Text size="sm" component="ul" style={{ margin: 0, paddingLeft: "1.5rem" }}>
                <li>{t("Delete the connector configuration")}</li>
                <li>{t("Remove all loaded data")}</li>
                <li>{t("Clear all connection settings")}</li>
              </Text>
            </Stack>
          </Alert>

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isHandlingAction}
            >
              {t("Cancel")}
            </Button>
            <Button
              color="red"
              onClick={handleDelete}
              loading={isHandlingAction}
              disabled={isHandlingAction}
              leftSection={<IconTrash size="1rem" />}
            >
              {t("Delete Permanently")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={errorDetailsModalOpen}
        onClose={() => setErrorDetailsModalOpen(false)}
        title={t("Error Details")}
        centered
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm">
            {t("The last data load job failed with the following error:")}
          </Text>

          <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {connector?.lastDataJob?.error || t("No error details available")}
          </Code>

          <Group justify="flex-end" gap="sm">
            <Button
              onClick={() => setErrorDetailsModalOpen(false)}
            >
              {t("Close")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

export default DataConnectButton;
