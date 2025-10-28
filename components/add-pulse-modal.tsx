"use client";

import { Modal, Stack, TextInput, Textarea, Button, Group, Text, Alert, Badge, Select, NumberInput, Switch } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconClock, IconArrowRight } from "@tabler/icons-react";
import { useState } from "react";

import { generateCronExpression, ScheduleFrequency } from "@/lib/pulse/cron-utils";

interface AddPulseModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddPulseModal({ opened, onClose, onSuccess }: AddPulseModalProps) {
  // Check if mobile device
  const isMobile = useMediaQuery("(max-width: 768px)");
  
  // Step management (0: basic info, 1: schedule config)
  const [activeStep, setActiveStep] = useState(0);
  
  // Step 0: Basic information
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  
  // Step 1: Schedule configuration
  const [enabled, setEnabled] = useState(true);
  
  // Schedule components
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [interval, setInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // 0=Sunday, 1=Monday, etc.
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  
  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step information
  const steps = [
    { title: "Basic Info", description: "Name & prompt" },
    { title: "Schedule", description: "Configure timing" }
  ];
  
  const currentStep = steps[activeStep];
  
  // Helper function to toggle day selection
  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        // Don't allow deselecting all days
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort();
    });
  };
  
  const handleContinueToSchedule = () => {
    if (!name.trim() || !description.trim() || !prompt.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    
    setError(null);
    setActiveStep(1);
  };
  
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    
    // Validate inputs
    if (!name || !description || !prompt) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }
    
    // Generate cron expression from schedule components
    const cronExpression = generateCronExpression({
      frequency,
      interval,
      selectedDays,
      hour,
      minute
    });
    
    const response = await fetch("/api/pulse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        prompt,
        cron: cronExpression,
        cronTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        enabled
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to create pulse");
      setLoading(false);
      return;
    }
    
    // Reset form
    setActiveStep(0);
    setPrompt("");
    setName("");
    setDescription("");
    setEnabled(true);
    setFrequency("weekly");
    setInterval(1);
    setSelectedDays([1]);
    setHour(9);
    setMinute(0);
    
    // Call success callback and close
    onSuccess?.();
    onClose();
    setLoading(false);
  };
  
  const handleClose = () => {
    if (!loading) {
      // Reset form on close
      setActiveStep(0);
      setName("");
      setDescription("");
      setPrompt("");
      setEnabled(true);
      setFrequency("weekly");
      setInterval(1);
      setSelectedDays([1]);
      setHour(9);
      setMinute(0);
      setError(null);
      onClose();
    }
  };
  
  const handleBack = () => {
    setActiveStep(0);
    setError(null);
  };
  
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <IconClock size={20} />
          <Text size="lg" fw={600}>Create New Pulse</Text>
          <Badge variant="light" size="lg">
            Step {activeStep + 1} of {steps.length}: {currentStep.title}
          </Badge>
        </Group>
      }
      size="xl"
      fullScreen={isMobile}
      centered={!isMobile}
    >
      <Stack gap="md">
        {/* Step 0: Basic Information */}
        {activeStep === 0 && (
          <>
            <Text size="sm" c="dimmed">
              Create a pulse to receive automated reports on a regular schedule.
            </Text>
            
            <TextInput
              label="Name"
              placeholder="Weekly Sales Report"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              autoFocus
            />
            
            <Textarea
              label="Description"
              placeholder="Automated weekly summary of sales performance..."
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              minRows={2}
              required
            />
            
            <Textarea
              label="Prompt"
              description="What would you like regular updates on?"
              placeholder="e.g., Weekly summary of my YouTube watch time, or Daily sales report with top products"
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              minRows={3}
              required
            />
          </>
        )}
        
        {/* Step 1: Schedule Configuration */}
        {activeStep === 1 && (
          <>
            <Text size="sm" c="dimmed">
              Configure when and how often this pulse should run.
            </Text>
            
            <Stack gap="xs">
              <Text size="sm" fw={500}>Repeat every</Text>
              <Group gap="xs" align="flex-start">
                {frequency === "hourly" && (
                  <NumberInput
                    value={interval}
                    onChange={(val) => setInterval(typeof val === "number" ? val : 1)}
                    min={1}
                    max={12}
                    style={{ width: "80px" }}
                  />
                )}
                {frequency !== "hourly" && (
                  <NumberInput
                    value={interval}
                    onChange={(val) => setInterval(typeof val === "number" ? val : 1)}
                    min={1}
                    max={30}
                    style={{ width: "80px" }}
                  />
                )}
                <Select
                  value={frequency}
                  onChange={(val) => {
                    const newFreq = (val as ScheduleFrequency) || "weekly";
                    setFrequency(newFreq);
                    // Reset interval when changing frequency
                    if (newFreq === "hourly") {
                      setInterval(1);
                    }
                  }}
                  data={[
                    { value: "hourly", label: frequency === "hourly" && interval !== 1 ? "hours" : "hour" },
                    { value: "daily", label: "day" },
                    { value: "weekly", label: "week" },
                    { value: "monthly", label: "month" }
                  ]}
                  style={{ flex: 1 }}
                />
              </Group>
            </Stack>
            
            {frequency === "weekly" && (
              <Stack gap="xs">
                <Text size="sm" fw={500}>Repeat on</Text>
                <Group gap="xs">
                  {[
                    { label: "S", value: 0, name: "Sunday" },
                    { label: "M", value: 1, name: "Monday" },
                    { label: "T", value: 2, name: "Tuesday" },
                    { label: "W", value: 3, name: "Wednesday" },
                    { label: "T", value: 4, name: "Thursday" },
                    { label: "F", value: 5, name: "Friday" },
                    { label: "S", value: 6, name: "Saturday" }
                  ].map((day) => (
                    <Button
                      key={day.value}
                      size="md"
                      radius="xl"
                      variant={selectedDays.includes(day.value) ? "filled" : "default"}
                      onClick={() => toggleDay(day.value)}
                      style={{ width: "40px", height: "40px", padding: 0 }}
                      title={day.name}
                    >
                      {day.label}
                    </Button>
                  ))}
                </Group>
              </Stack>
            )}
            
            {frequency === "hourly" ? (
              <Select
                label="Minute"
                description="At which minute of the hour should this run?"
                value={minute.toString()}
                onChange={(val) => setMinute(parseInt(val || "0", 10))}
                data={Array.from({ length: 60 }, (_, i) => ({
                  value: i.toString(),
                  label: i.toString().padStart(2, "0")
                }))}
              />
            ) : (
              <Group gap="md" grow>
                <Select
                  label="Hour"
                  value={hour.toString()}
                  onChange={(val) => setHour(parseInt(val || "9", 10))}
                  data={Array.from({ length: 24 }, (_, i) => ({
                    value: i.toString(),
                    label: i.toString().padStart(2, "0")
                  }))}
                />
                <Select
                  label="Minute"
                  value={minute.toString()}
                  onChange={(val) => setMinute(parseInt(val || "0", 10))}
                  data={[
                    { value: "0", label: "00" },
                    { value: "15", label: "15" },
                    { value: "30", label: "30" },
                    { value: "45", label: "45" }
                  ]}
                />
              </Group>
            )}
            
            <Alert icon={<IconAlertCircle size="1rem" />} color="blue" variant="light">
              Reports will be sent to your email address automatically.
            </Alert>
            
            <Switch
              label="Enable this pulse"
              description="When enabled, reports will be generated and sent automatically according to the schedule above"
              checked={enabled}
              onChange={(event) => setEnabled(event.currentTarget.checked)}
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
          <Group gap="sm">
            <Button
              variant="subtle"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            
            {activeStep === 1 && (
              <Button
                variant="subtle"
                onClick={handleBack}
                disabled={loading}
              >
                Back
              </Button>
            )}
          </Group>
          
          <Group gap="sm">
            {activeStep === 0 && (
              <Button
                onClick={handleContinueToSchedule}
                rightSection={<IconArrowRight size="1rem" />}
                disabled={!name.trim() || !description.trim() || !prompt.trim()}
              >
                Continue to Schedule
              </Button>
            )}
            
            {activeStep === 1 && (
              <Button
                leftSection={<IconClock size="1rem" />}
                onClick={handleSubmit}
                loading={loading}
                disabled={loading}
              >
                Create Pulse
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

