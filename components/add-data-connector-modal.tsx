"use client";

import { Modal, Stack, TextInput, Textarea, Select, Button, Group, Text, Loader, Alert, JsonInput, Badge, Code, Checkbox, Paper, Accordion } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconPlus, IconColumns } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import type { DataLoaderInfo } from "@/lib/types";

/**
 * Format an error message or object into a human-friendly YAML-like format
 */
function formatErrorMessage(error: string): React.ReactNode {
  // Try to parse as JSON and format nicely
  try {
    const parsed = JSON.parse(error);
    if (typeof parsed === "object" && parsed !== null) {
      // Convert object to YAML-like format
      const yamlLike = Object.entries(parsed)
        .map(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            const nested = JSON.stringify(value, null, 2)
              .split("\n")
              .map((line, i) => (i === 0 ? line : `  ${line}`))
              .join("\n");
            return `${key}:\n  ${nested}`;
          }
          return `${key}: ${value}`;
        })
        .join("\n");
      return <Code block>{yamlLike}</Code>;
    }
  } catch {
    // Not JSON, check if it looks like an error with structured info
    const lines = error.split("\n");
    if (lines.length > 1) {
      return (
        <Stack gap="xs">
          {lines.map((line, i) => (
            <Text key={i} size="sm">{line}</Text>
          ))}
        </Stack>
      );
    }
  }
  
  // Return plain text for simple errors
  return <Text size="sm">{error}</Text>;
}

interface AddDataConnectorModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddDataConnectorModal({ opened, onClose, onSuccess }: AddDataConnectorModalProps) {
  // Check if mobile device
  const isMobile = useMediaQuery("(max-width: 768px)");
  
  // Step management (0-indexed)
  const [activeStep, setActiveStep] = useState(0);
  
  // Step 1: Data loader configuration
  const [selectedLoaderName, setSelectedLoaderName] = useState<string | null>(null);
  const [loaderConfig, setLoaderConfig] = useState("{}");
  const [loaderConfigError, setLoaderConfigError] = useState<string | null>(null);
  const [availableLoaders, setAvailableLoaders] = useState<DataLoaderInfo[]>([]);
  const [configValidated, setConfigValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Step 2: Resource selection
  const [resourceNames, setResourceNames] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  
  // Resource details for step 2
  interface ResourceDetail {
    resourceName: string;
    columns: string[];
    timestampColumns: string[];
    idColumn?: string;
    createdAtColumn?: string;
    updatedAtColumn?: string;
    recordCount?: number;
  }
  const [resourceDetails, setResourceDetails] = useState<Map<string, ResourceDetail>>(new Map());
  const [loadingResourceDetails, setLoadingResourceDetails] = useState(false);
  
  // Step 3: Name and description
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [autoFillingConfig, setAutoFillingConfig] = useState(false);
  
  // General state
  const [loading, setLoading] = useState(false);
  const [isHandlingNext, setIsHandlingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step information
  const steps = [
    { title: "Configure", description: "Data loader setup" },
    { title: "Resources", description: "Select data sources" },
    { title: "Details", description: "Name and description" }
  ];
  
  const currentStep = steps[activeStep];

  // Load available data loaders on mount
  useEffect(() => {
    const fetchLoaders = async () => {
      const response = await fetch("/api/data-loader");
      if (response.ok) {
        const data = await response.json();
        // Filter out hidden loaders
        const visibleLoaders = data.loaders.filter((loader: DataLoaderInfo) => !loader.isHidden);
        setAvailableLoaders(visibleLoaders);
      }
    };

    if (opened) {
      fetchLoaders();
    }
  }, [opened]);

  // Update loader config when data loader selection changes
  useEffect(() => {
    if (!selectedLoaderName) {
      setLoaderConfig("{}");
      setConfigValidated(false);
      setValidationError(null);
      setResourceNames([]);
      return;
    }

    const selectedLoader = availableLoaders.find(loader => loader.name === selectedLoaderName);
    if (selectedLoader) {
      setLoaderConfig(JSON.stringify(selectedLoader.exampleConfig, null, 2));
      setConfigValidated(false);
      setValidationError(null);
      setResourceNames([]);
    }
  }, [selectedLoaderName, availableLoaders]);

  // Validate loader config when it changes (with debounce)
  useEffect(() => {
    if (!selectedLoaderName) {
      return;
    }

    // Reset validation state when config changes
    setConfigValidated(false);
    setValidationError(null);

    const validateConfig = async () => {
      // Validate JSON first
      let parsedConfig: Record<string, any>;
      try {
        parsedConfig = JSON.parse(loaderConfig);
        setLoaderConfigError(null);
      } catch {
        setLoaderConfigError("Invalid JSON");
        setValidationError("Invalid JSON configuration");
        setResourceNames([]);
        return;
      }

      setLoadingResources(true);

      try {
        const queryParams = new URLSearchParams({
          loaderConfig: JSON.stringify(parsedConfig)
        });

        const response = await fetch(`/api/data-loader/${selectedLoaderName}/resource?${queryParams}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText);
        }

        const data = await response.json();
        const resources = data.resourceNames || [];
        setResourceNames(resources);
        setConfigValidated(true);
        setValidationError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to connect to data source";
        setValidationError(errorMessage);
        setResourceNames([]);
        setConfigValidated(false);
      } finally {
        setLoadingResources(false);
      }
    };

    // Debounce validation to avoid too many requests
    const timeoutId = setTimeout(validateConfig, 1000);
    return () => clearTimeout(timeoutId);
  }, [selectedLoaderName, loaderConfig]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    // Validate inputs
    if (!name || !description || !selectedLoaderName || selectedResources.length === 0) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    // Validate JSON config
    let parsedConfig: Record<string, any>;
    try {
      parsedConfig = JSON.parse(loaderConfig);
    } catch {
      setError("Invalid loader configuration JSON");
      setLoading(false);
      return;
    }

    // Build resources array with optional column configuration
    const resources = selectedResources.map((resourceName) => {
      const details = resourceDetails.get(resourceName);
      return {
        name: resourceName,
        ...(details?.idColumn && { idColumn: details.idColumn }),
        ...(details?.createdAtColumn && { createdAtColumn: details.createdAtColumn }),
        ...(details?.updatedAtColumn && { updatedAtColumn: details.updatedAtColumn })
      };
    });

    const response = await fetch("/api/data", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        resources,
        dataLoader: selectedLoaderName,
        dataLoaderOptions: parsedConfig
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to add connector");
      setLoading(false);
      return;
    }

    // Reset form
    setName("");
    setDescription("");
    setSelectedLoaderName(null);
    setLoaderConfig("{}");
    setSelectedResources([]);
    setResourceNames([]);
    setResourceDetails(new Map());

    // Call success callback and close
    onSuccess?.();
    onClose();
    setLoading(false);
  };

  const handleNext = async () => {
    setError(null);
    setIsHandlingNext(true);
    
    if (activeStep === 0) {
      // Step 1 -> Step 2: Config already validated, just move to resource selection
      if (!selectedLoaderName) {
        setError("Please select a data loader");
        setIsHandlingNext(false);
        return;
      }
      
      if (!configValidated) {
        setError("Please wait for configuration validation to complete");
        setIsHandlingNext(false);
        return;
      }
      
      // Pre-select all resources
      setSelectedResources(resourceNames);
      
      // Load resource details for all resources
      await loadResourceDetails();
      
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Step 2 -> Step 3: Validate resource selection
      if (selectedResources.length === 0) {
        setError("Please select at least one resource");
        setIsHandlingNext(false);
        return;
      }
      
      // Auto-fill name and description for Step 3
      await handleAutoFillConfig();
      
      setActiveStep(2);
    }
    
    setIsHandlingNext(false);
  };

  const handleAutoFillConfig = async () => {
    if (!selectedLoaderName) return;
    
    setAutoFillingConfig(true);
    
    try {
      // Build resource information with schemas and columns
      const resourcesInfo = selectedResources.map(resourceName => {
        const details = resourceDetails.get(resourceName);
        return {
          name: resourceName,
          schema: {},
          columns: details?.columns || [],
          timestampColumns: details?.timestampColumns || [],
          recordCount: details?.recordCount
        };
      });
      
      const response = await fetch("/api/data/autofill-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resources: resourcesInfo
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setName(data.name || "");
        setDescription(data.description || "");
      }
    } catch (err) {
      console.error("Failed to auto-fill configuration:", err);
    } finally {
      setAutoFillingConfig(false);
    }
  };

  const loadResourceDetails = async () => {
    if (!selectedLoaderName || resourceNames.length === 0) return;
    
    setLoadingResourceDetails(true);
    const newDetails = new Map<string, ResourceDetail>();
    
    let parsedConfig: Record<string, any>;
    try {
      parsedConfig = JSON.parse(loaderConfig);
    } catch {
      setLoadingResourceDetails(false);
      return;
    }
    
    // Load details for first 10 resources (to avoid overwhelming the API)
    const resourcesToLoad = resourceNames.slice(0, 10);
    
    await Promise.all(
      resourcesToLoad.map(async (resourceName) => {
        try {
          const queryParams = new URLSearchParams({
            loaderConfig: JSON.stringify(parsedConfig)
          });
          
          const response = await fetch(
            `/api/data-loader/${selectedLoaderName}/resource/${encodeURIComponent(resourceName)}?${queryParams}`
          );
          
          if (response.ok) {
            const data = await response.json();
            
            // Auto-detect ID column:
            // 1. Use primaryKeyColumn from database schema if available (most accurate)
            // 2. Fall back to pattern matching for common ID column names
            const idColumn = data.primaryKeyColumn || 
              data.columns.find((col: string) => 
                col.toLowerCase() === "id" || col.toLowerCase() === "uuid" || col.toLowerCase() === "guid"
              );
            
            // Auto-detect timestamp columns
            const createdAtColumn = data.timestampColumns.find((col: string) => 
              col === "created_at" || col === "createdat" || col === "inserted_at"
            );
            const updatedAtColumn = data.timestampColumns.find((col: string) => 
              col === "updated_at" || col === "updatedat" || col === "modified_at"
            );
            
            newDetails.set(resourceName, {
              resourceName,
              columns: data.columns || [],
              timestampColumns: data.timestampColumns || [],
              idColumn,
              createdAtColumn,
              updatedAtColumn,
              recordCount: data.recordCount
            });
          }
        } catch (err) {
          console.error(`Failed to load details for resource ${resourceName}:`, err);
        }
      })
    );
    
    setResourceDetails(newDetails);
    setLoadingResourceDetails(false);
  };

  const handleBack = () => {
    setError(null);
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  const handleClose = () => {
    if (!loading && !isHandlingNext) {
      // Reset form on close
      setActiveStep(0);
      setName("");
      setDescription("");
      setSelectedLoaderName(null);
      setLoaderConfig("{}");
      setSelectedResources([]);
      setResourceNames([]);
      setResourceDetails(new Map());
      setError(null);
      setLoaderConfigError(null);
      setConfigValidated(false);
      setValidationError(null);
      setIsHandlingNext(false);
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <Text size="lg" fw={600}>Add New Data Connector</Text>
          <Badge variant="light" size="lg">
            Step {activeStep + 1} of {steps.length}: {currentStep.title}
          </Badge>
        </Group>
      }
      size="lg"
      fullScreen={isMobile}
      centered={!isMobile}
    >
      <Stack gap="md">
          {/* Step 1: Configure Data Loader */}
          {activeStep === 0 && (
            <>
              <Select
                label="Data Loader"
                placeholder="Select a data loader"
                description="Choose the type of data loader to use"
                data={availableLoaders.map(loader => loader.name)}
                value={selectedLoaderName}
                onChange={setSelectedLoaderName}
                required
              />

              {selectedLoaderName && (
                <>
                  <JsonInput
                    label="Loader Configuration"
                    placeholder='{"key": "value"}'
                    description="Configuration options for the data loader (JSON format)"
                    value={loaderConfig}
                    onChange={(value) => {
                      setLoaderConfig(value);
                      // Clear error when user starts typing
                      if (loaderConfigError) {
                        setLoaderConfigError(null);
                      }
                    }}
                    minRows={6}
                    maxRows={12}
                    validationError={loaderConfigError}
                    formatOnBlur
                    autosize
                  />

                  {/* Validation Status */}
                  {loadingResources && (
                    <Alert color="blue">
                      <Group gap="sm">
                        <Loader size="sm" />
                        <Text size="sm">Validating configuration...</Text>
                      </Group>
                    </Alert>
                  )}

                  {!loadingResources && validationError && (
                    <Alert icon={<IconAlertCircle size="1rem" />} color="red" title="Configuration Error">
                      {formatErrorMessage(validationError)}
                    </Alert>
                  )}

                  {!loadingResources && configValidated && resourceNames.length > 0 && (
                    <Alert color="green" title="Configuration Valid">
                      <Stack gap="xs">
                        <Text size="sm">
                          Successfully connected! Found {resourceNames.length} available resource{resourceNames.length !== 1 ? "s" : ""}.
                        </Text>
                        {resourceNames.length > 0 && (
                          <Text size="xs" c="dimmed">
                            Preview: {resourceNames.slice(0, 5).join(", ")}
                            {resourceNames.length > 5 && ` and ${resourceNames.length - 5} more...`}
                          </Text>
                        )}
                      </Stack>
                    </Alert>
                  )}

                  {!loadingResources && configValidated && resourceNames.length === 0 && (
                    <Alert color="yellow" icon={<IconAlertCircle size="1rem" />} title="No Resources Found">
                      <Text size="sm">
                        Connected successfully, but no resources were found in this data source.
                      </Text>
                    </Alert>
                  )}
                </>
              )}
            </>
          )}

          {/* Step 2: Select Resources */}
          {activeStep === 1 && (
            <>
              {loadingResourceDetails ? (
                <Group gap="md" align="center" justify="center" py="xl">
                  <Loader size="md" />
                  <Stack gap="xs">
                    <Text size="sm" fw={500}>
                      Loading resource details...
                    </Text>
                    <Text size="xs" c="dimmed">
                      Analyzing schemas and columns for each resource
                    </Text>
                  </Stack>
                </Group>
              ) : resourceNames.length > 0 ? (
                <Stack gap="md">
                  <Text size="sm" c="dimmed">
                    Select resources to sync and optionally configure timestamp columns for incremental syncing
                  </Text>
                  
                  <Accordion variant="separated" multiple>
                    {resourceNames.map((resourceName) => {
                      const details = resourceDetails.get(resourceName);
                      const isSelected = selectedResources.includes(resourceName);
                      
                      return (
                        <Accordion.Item key={resourceName} value={resourceName}>
                          <Accordion.Control>
                            <Group justify="space-between" wrap="nowrap">
                              <Group gap="sm">
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (isSelected) {
                                      setSelectedResources(selectedResources.filter(r => r !== resourceName));
                                    } else {
                                      setSelectedResources([...selectedResources, resourceName]);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <Text fw={500}>{resourceName}</Text>
                              </Group>
                              {details && (
                                <Group gap="xs">
                                  <Badge size="sm" variant="light" leftSection={<IconColumns size="0.8rem" />}>
                                    {details.columns.length} columns
                                  </Badge>
                                  {details.recordCount !== undefined && (
                                    <Badge size="sm" variant="light">
                                      {details.recordCount.toLocaleString()} records
                                    </Badge>
                                  )}
                                </Group>
                              )}
                            </Group>
                          </Accordion.Control>
                          
                          <Accordion.Panel>
                            {details ? (
                              <Stack gap="md">
                                <Paper p="sm" withBorder>
                                  <Stack gap="xs">
                                    <Text size="sm" fw={500}>Columns ({details.columns.length})</Text>
                                    <Text size="xs" c="dimmed" style={{ wordBreak: "break-word" }}>
                                      {details.columns.slice(0, 20).join(", ")}
                                      {details.columns.length > 20 && ` and ${details.columns.length - 20} more...`}
                                    </Text>
                                  </Stack>
                                </Paper>
                                
                                {details.columns.length > 0 && (
                                  <Paper p="sm" withBorder>
                                    <Stack gap="sm">
                                      <Text size="sm" fw={500}>Primary Key Configuration</Text>
                                      <Text size="xs" c="dimmed">
                                        Specify the unique identifier column for this resource
                                      </Text>
                                      
                                      <Select
                                        label="ID Column"
                                        placeholder="Select primary key column (optional)"
                                        description="Auto-detected or specify manually (defaults to 'id', 'uuid', or 'guid' if not set)"
                                        data={[{ value: "", label: "Auto-detect" }, ...details.columns.map(col => ({ value: col, label: col }))]}
                                        value={details.idColumn || ""}
                                        onChange={(value) => {
                                          const newDetails = new Map(resourceDetails);
                                          const detail = newDetails.get(resourceName);
                                          if (detail) {
                                            detail.idColumn = value || undefined;
                                            newDetails.set(resourceName, detail);
                                            setResourceDetails(newDetails);
                                          }
                                        }}
                                        clearable
                                        searchable
                                      />
                                    </Stack>
                                  </Paper>
                                )}
                                
                                {details.timestampColumns.length > 0 && (
                                  <Paper p="sm" withBorder>
                                    <Stack gap="sm">
                                      <Text size="sm" fw={500}>Incremental Sync Configuration</Text>
                                      <Text size="xs" c="dimmed">
                                        Configure timestamp columns for efficient incremental syncing
                                      </Text>
                                      
                                      <Select
                                        label="Created At Column"
                                        placeholder="Select creation timestamp column (optional)"
                                        description="Used to track when records were created"
                                        data={[{ value: "", label: "None" }, ...details.timestampColumns.map(col => ({ value: col, label: col }))]}
                                        value={details.createdAtColumn || ""}
                                        onChange={(value) => {
                                          const newDetails = new Map(resourceDetails);
                                          const detail = newDetails.get(resourceName);
                                          if (detail) {
                                            detail.createdAtColumn = value || undefined;
                                            newDetails.set(resourceName, detail);
                                            setResourceDetails(newDetails);
                                          }
                                        }}
                                        clearable
                                      />
                                      
                                      <Select
                                        label="Updated At Column"
                                        placeholder="Select update timestamp column (optional)"
                                        description="Used to track when records were last modified"
                                        data={[{ value: "", label: "None" }, ...details.timestampColumns.map(col => ({ value: col, label: col }))]}
                                        value={details.updatedAtColumn || ""}
                                        onChange={(value) => {
                                          const newDetails = new Map(resourceDetails);
                                          const detail = newDetails.get(resourceName);
                                          if (detail) {
                                            detail.updatedAtColumn = value || undefined;
                                            newDetails.set(resourceName, detail);
                                            setResourceDetails(newDetails);
                                          }
                                        }}
                                        clearable
                                      />
                                    </Stack>
                                  </Paper>
                                )}
                              </Stack>
                            ) : (
                              <Alert color="blue" icon={<IconAlertCircle size="1rem" />}>
                                <Text size="sm">
                                  Schema information not available for this resource. It will still be synced.
                                </Text>
                              </Alert>
                            )}
                          </Accordion.Panel>
                        </Accordion.Item>
                      );
                    })}
                  </Accordion>
                  
                  {selectedResources.length === 0 && (
                    <Alert color="yellow" icon={<IconAlertCircle size="1rem" />}>
                      Please select at least one resource to continue
                    </Alert>
                  )}
                </Stack>
              ) : (
                <Alert icon={<IconAlertCircle size="1rem" />} color="blue">
                  No resources found. Please check your configuration in the previous step.
                </Alert>
              )}
            </>
          )}

          {/* Step 3: Name and Description */}
          {activeStep === 2 && (
            <>
              {autoFillingConfig && (
                <Alert color="blue">
                  <Group gap="sm">
                    <Loader size="sm" />
                    <Text size="sm">Auto-generating connector details...</Text>
                  </Group>
                </Alert>
              )}
              
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>Connector Details</Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={handleAutoFillConfig}
                    loading={autoFillingConfig}
                  >
                    Auto-fill
                  </Button>
                </Group>
              </Stack>
              
              <TextInput
                label="Name"
                placeholder="My Custom Connector"
                description="Display name for this connector"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                required
                autoFocus
              />

              <Textarea
                label="Description"
                placeholder="Describe what data this connector loads..."
                description="Brief description of the data connector"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                minRows={3}
                required
              />
            </>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size="1rem" />} color="red">
              {error}
            </Alert>
          )}

        {/* Navigation Buttons */}
        <Group justify="space-between" gap="sm" mt="xl">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={loading || loadingResources || isHandlingNext}
          >
            Cancel
          </Button>
          
          <Group gap="sm">
            {activeStep > 0 && (
              <Button
                variant="default"
                onClick={handleBack}
                disabled={loading || loadingResources || isHandlingNext}
              >
                Back
              </Button>
            )}
            
            {activeStep < 2 ? (
              <Button
                onClick={handleNext}
                disabled={activeStep === 0 ? (!selectedLoaderName || !configValidated || loadingResources) : false}
                loading={isHandlingNext}
              >
                Next
              </Button>
            ) : (
              <Button
                leftSection={<IconPlus size="1rem" />}
                onClick={handleSubmit}
                loading={loading}
                disabled={loading || !name || !description}
              >
                Add Connector
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

