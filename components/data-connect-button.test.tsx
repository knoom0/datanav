/**
 * @vitest-environment jsdom
 */
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { DataConnectButton } from "@/components/data-connect-button";

// Mock fetch globally
global.fetch = vi.fn();

const mockFetch = global.fetch as any;

// Wrapper component for Mantine provider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

describe("DataConnectButton", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should display connector information when loaded successfully", async () => {
    const mockConnectorInfo = {
      id: "google-calendar",
      name: "Google Calendar",
      description: "Connect to Google Calendar for event data",
      isConnected: false,
      lastLoadedAt: null,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConnectorInfo,
    } as Response);

    render(
      <TestWrapper>
        <DataConnectButton connectorId="google-calendar" />
      </TestWrapper>
    );

    // Initially should show loading
    expect(screen.getByText("Loading connector...")).toBeInTheDocument();

    // Wait for connector info to load
    await waitFor(() => {
      expect(screen.getByText("Google Calendar")).toBeInTheDocument();
    });

    expect(screen.getByText("Connect to Google Calendar for event data")).toBeInTheDocument();
    expect(screen.getByText("Not Connected")).toBeInTheDocument();
    expect(screen.getByText("Last loaded: Never")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("should handle connection flow when connect button is clicked", async () => {
    const mockConnectorInfo = {
      id: "google-calendar",
      name: "Google Calendar",
      description: "Connect to Google Calendar for event data",
      isConnected: false,
      lastLoadedAt: null,
    };

    const mockConnectResult = {
      success: true,
      authUrl: "https://accounts.google.com/oauth/authorize?...",
    };

    const mockUpdatedConnectorInfo = {
      ...mockConnectorInfo,
      isConnected: true,
      lastLoadedAt: new Date().toISOString(),
    };

    // Mock initial connector info fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockConnectorInfo,
    } as Response);

    const onConnectStart = vi.fn();
    const onConnectComplete = vi.fn();

    render(
      <TestWrapper>
        <DataConnectButton 
          connectorId="google-calendar" 
          onConnectStart={onConnectStart}
          onConnectComplete={onConnectComplete}
        />
      </TestWrapper>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Google Calendar")).toBeInTheDocument();
    });

    // Mock connect API call and refresh call
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockConnectResult,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUpdatedConnectorInfo,
      } as Response);

    // Click connect button
    const connectButton = screen.getByRole("button", { name: /connect/i });
    fireEvent.click(connectButton);

    // Verify callbacks were called
    expect(onConnectStart).toHaveBeenCalled();

    await waitFor(() => {
      expect(onConnectComplete).toHaveBeenCalledWith(mockConnectResult);
    });

    // Verify API calls were made
    expect(mockFetch).toHaveBeenCalledWith("/api/data/google-calendar/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  });
});
