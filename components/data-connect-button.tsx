"use client";

import { Button, Paper, Text, Group, Stack, Badge, Loader, Alert, Menu, Modal, ActionIcon, Code } from "@mantine/core";
import { IconPlug, IconPlugConnected, IconAlertCircle, IconClock, IconRefresh, IconDots, IconTrash, IconCheck, IconX, IconInfoCircle } from "@tabler/icons-react";
import humanNumber from "human-number";
import humanizeDuration from "humanize-duration";
import { useState, useEffect, useCallback } from "react";

import { useDataConnector } from "@/hooks/use-data-connector";
import { DataConnectorInfo, DataJobInfo } from "@/lib/types";

const JOB_POLLING_INTERVAL_MS = 500;

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
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [errorDetailsModalOpen, setErrorDetailsModalOpen] = useState(false);
  const [jobInfo, setJobInfo] = useState<DataJobInfo | null>(null);
  const [isHandlingAction, setIsHandlingAction] = useState(false);

  // Use the data connector hook for all connector operations
  const {
    connect,
    load,
    disconnect,
    isConnecting,
    isLoading,
    isDisconnecting,
    error: connectionError,
    setError: setConnectionError,
  } = useDataConnector({
    connectorId,
    onConnectStart,
    onConnectComplete: (result) => {
      onConnectComplete?.(result);
      // Refresh connector info after successful connection
      if (result.success) {
        fetchConnectorInfo();
      }
    },
    onLoadComplete: () => {
      // Refresh connector info after load
      fetchConnectorInfo();
    },
    onDisconnectComplete: () => {
      setDisconnectModalOpen(false);
      // Refresh connector info after disconnect
      fetchConnectorInfo();
    },
  });

  // Combine errors from connection and other operations
  const error = connectionError;
  const setError = setConnectionError;

  // Fetch connector information
  const fetchConnectorInfo = useCallback(async () => {
    setError(null);
    
    const response = await fetch(`/api/data/${connectorId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      setError(`Failed to load connector: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    setConnector(data);
  }, [connectorId, setError]);

  useEffect(() => {
    if (connectorId) {
      fetchConnectorInfo();
    }
  }, [connectorId, fetchConnectorInfo]);

  // Poll connector status when we have an active job
  useEffect(() => {
    if (!connector?.dataJobId) return;

    const pollConnectorStatus = async () => {
      try {
        const response = await fetch(`/api/data/${connectorId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch connector status: ${response.statusText}`);
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
        setError(`Failed to check connector status: ${error}`);
        setJobInfo(null);
      }
    };

    // Poll immediately, then every 2 seconds
    pollConnectorStatus();
    const interval = setInterval(pollConnectorStatus, JOB_POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connector?.dataJobId, connectorId]);

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
        setError(`Delete failed: ${errorText}`);
        return;
      }

      setDeleteModalOpen(false);

      // Call onDelete callback to refresh the connector list
      onDelete?.();
    } finally {
      setIsHandlingAction(false);
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

  // Render last load result status
  const renderLastLoadStatus = () => {
    if (!connector) return null;
    const { lastDataJob } = connector;
    
    if (!lastDataJob) {
      return (
        <Group gap="xs" align="center">
          <IconClock size="0.9rem" style={{ color: "var(--mantine-color-dimmed)" }} />
          <Text size="xs" c="dimmed">
            Never loaded
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
            Last load {isSuccess ? "successful" : isError ? "failed" : "canceled"}
          </Text>
          {isError && lastDataJob.error && (
            <ActionIcon
              size="xs"
              variant="subtle"
              color="red"
              onClick={() => setErrorDetailsModalOpen(true)}
              aria-label="View error details"
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
        return "Loading";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Format runtime using humanize-duration
  const formatRunTime = (runTimeMs: number) => {
    return humanizeDuration(runTimeMs, {
      largest: 2,
      round: true,
      units: ["m", "s"],
    });
  };

  // Format record count using human-number
  const formatRecordCount = (count: number) => {
    if (count === 0) return "0 records";
    if (count === 1) return "1 record";
    return `${humanNumber(count, (n: number) => Number(n.toFixed(1)))} records`;
  };

  if (!connector) {
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
                  onClick={connect}
                  disabled={connector.isLoading || isConnecting || isDisconnecting}
                >
                  Reconnect
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size="0.9rem" />}
                  color="red"
                  onClick={() => setDisconnectModalOpen(true)}
                  disabled={!connector.isConnected || connector.isLoading || isDisconnecting}
                >
                  Disconnect
                </Menu.Item>
                {connector.isRemovable && (
                  <Menu.Item
                    leftSection={<IconTrash size="0.9rem" />}
                    color="red"
                    onClick={() => setDeleteModalOpen(true)}
                    disabled={connector.isLoading || isHandlingAction}
                  >
                    Delete Connector
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
              ? "Loading..." 
              : connector.isConnected 
                ? "Connected" 
                : "Not Connected"
            }
          </Badge>

          {/* Job Info */}
          {connector.isLoading && jobInfo && (
            <Stack gap="xs">
              <Group gap="xs" align="center">
                <Text size="sm" fw={500}>
                  {formatJobType(jobInfo.type || "unknown")} Job
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
              onClick={load}
              loading={connector.isLoading || isLoading}
              disabled={connector.isLoading || isLoading}
              leftSection={<IconRefresh size="1rem" />}
              variant="light"
              size="sm"
            >
              Load Data
            </Button>
          )}
          {!connector.isConnected && (
            <Button
              onClick={connect}
              loading={connector.isLoading || isConnecting}
              disabled={connector.isLoading || isConnecting}
              leftSection={<IconPlug size="1rem" />}
              variant="filled"
              size="sm"
            >
              Connect
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
              disabled={connector.isLoading || isDisconnecting}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={disconnect}
              loading={connector.isLoading || isDisconnecting}
              disabled={connector.isLoading || isDisconnecting}
              leftSection={<IconTrash size="1rem" />}
            >
              Disconnect & Clear Data
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Data Connector"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to permanently delete <strong>{connector.name}</strong>?
          </Text>
          
          <Alert color="red" icon={<IconAlertCircle size="1rem" />}>
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                This action cannot be undone!
              </Text>
              <Text size="sm">
                This will:
              </Text>
              <Text size="sm" component="ul" style={{ margin: 0, paddingLeft: "1.5rem" }}>
                <li>Delete the connector configuration</li>
                <li>Remove all loaded data</li>
                <li>Clear all connection settings</li>
              </Text>
            </Stack>
          </Alert>

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isHandlingAction}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDelete}
              loading={isHandlingAction}
              disabled={isHandlingAction}
              leftSection={<IconTrash size="1rem" />}
            >
              Delete Permanently
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={errorDetailsModalOpen}
        onClose={() => setErrorDetailsModalOpen(false)}
        title="Error Details"
        centered
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm">
            The last data load job failed with the following error:
          </Text>
          
          <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {connector?.lastDataJob?.error || "No error details available"}
          </Code>

          <Group justify="flex-end" gap="sm">
            <Button
              onClick={() => setErrorDetailsModalOpen(false)}
            >
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

export default DataConnectButton;
