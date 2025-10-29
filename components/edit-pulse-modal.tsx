"use client";

import { Modal, Stack, TextInput, Textarea, Button, Group, Text, Alert, Select, NumberInput, Switch } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconClock, IconDeviceFloppy } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import type { PulseConfig } from "@/lib/entities";
import { generateCronExpression, parseCronExpression, ScheduleFrequency } from "@/lib/pulse/cron-utils";

interface EditPulseModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  config: PulseConfig | null;
}

export function EditPulseModal({ opened, onClose, onSuccess, config }: EditPulseModalProps) {
  // Check if mobile device
  const isMobile = useMediaQuery("(max-width: 768px)");
  
  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [enabled, setEnabled] = useState(true);
  
  // Schedule components
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [interval, setInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // 0=Sunday, 1=Monday, etc.
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [timezone, setTimezone] = useState("");
  
  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize form with config data when modal opens
  useEffect(() => {
    if (config && opened) {
      setName(config.name);
      setDescription(config.description);
      setPrompt(config.prompt);
      setEnabled(config.enabled);
      setTimezone(config.cronTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      
      // Parse cron expression into schedule components
      const scheduleComponents = parseCronExpression(config.cron);
      setFrequency(scheduleComponents.frequency);
      setInterval(scheduleComponents.interval || 1);
      setSelectedDays(scheduleComponents.selectedDays || [1]);
      setHour(scheduleComponents.hour || 9);
      setMinute(scheduleComponents.minute);
      
      setError(null);
    }
  }, [config, opened]);
  
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
  
  const handleSubmit = async () => {
    if (!config) return;
    
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
    
    const response = await fetch(`/api/pulse/${config.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        prompt,
        cron: cronExpression,
        cronTimezone: timezone,
        enabled
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      setError(errorData.error || "Failed to update pulse");
      setLoading(false);
      return;
    }
    
    // Call success callback and close
    onSuccess?.();
    onClose();
    setLoading(false);
  };
  
  const handleClose = () => {
    if (!loading) {
      setError(null);
      onClose();
    }
  };
  
  if (!config) return null;
  
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <IconClock size={20} />
          <Text size="lg" fw={600}>Edit Pulse</Text>
        </Group>
      }
      size="lg"
      fullScreen={isMobile}
      centered={!isMobile}
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Weekly Sales Report"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
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
          placeholder="What would you like regular updates on?"
          description="The prompt that defines what data and insights this pulse should generate"
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          minRows={3}
          required
        />
        
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
                value={1}
                disabled
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
        
        <Switch
          label="Enable this pulse"
          description="When enabled, reports will be generated and sent automatically according to the schedule above"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        
        {error && (
          <Alert icon={<IconAlertCircle size="1rem" />} color="red">
            {error}
          </Alert>
        )}
        
        {/* Action Buttons */}
        <Group justify="space-between" gap="sm" mt="xl">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          
          <Button
            leftSection={<IconDeviceFloppy size="1rem" />}
            onClick={handleSubmit}
            loading={loading}
            disabled={loading || !name || !description || !prompt}
          >
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

