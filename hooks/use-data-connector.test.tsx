/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";

import { useDataConnector } from "./use-data-connector";

// Mock react-plaid-link
vi.mock("react-plaid-link", () => ({
  usePlaidLink: vi.fn(() => ({
    open: vi.fn(),
    ready: true,
  })),
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockFetch = global.fetch as any;

describe("useDataConnector", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.clearAllMocks();
  });

  it("should handle successful direct connection", async () => {
    const mockResult = {
      success: true,
      connectorId: "test-connector",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const onConnectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
        onConnectComplete,
      })
    );

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();

    let connectResult: any;
    await act(async () => {
      connectResult = await result.current.connect();
    });

    expect(connectResult).toEqual(mockResult);
    expect(onConnectComplete).toHaveBeenCalledWith(mockResult);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should handle connection error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Connection failed",
    } as Response);

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe("Connection failed: Connection failed");
    expect(result.current.isConnecting).toBe(false);
  });

  it("should call onConnectStart callback", async () => {
    const mockResult = {
      success: true,
      connectorId: "test-connector",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const onConnectStart = vi.fn();
    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
        onConnectStart,
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(onConnectStart).toHaveBeenCalled();
  });

  it("should handle OAuth flow with authUrl", async () => {
    const mockResult = {
      success: false,
      authInfo: {
        authUrl: "https://oauth.example.com/authorize",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    // Mock window.open
    const mockWindow = {
      close: vi.fn(),
      closed: false,
    };
    const originalOpen = window.open;
    window.open = vi.fn(() => mockWindow as any);

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    // Verify window.open was called with correct parameters
    expect(window.open).toHaveBeenCalledWith(
      "https://oauth.example.com/authorize",
      "oauth",
      "width=500,height=600,scrollbars=yes,resizable=yes"
    );

    // Clean up
    window.open = originalOpen;
  });

  it("should handle Plaid Link flow", async () => {
    const mockResult = {
      success: false,
      authInfo: {
        authUrl: "plaid://?linkToken=test-link-token",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    // Should not throw error
    // Note: isConnecting will remain true until Plaid Link completes or is dismissed
    expect(result.current.error).toBeNull();
  });

  it("should handle invalid Plaid Link URL", async () => {
    const mockResult = {
      success: false,
      authInfo: {
        authUrl: "plaid://?invalid=true",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe("Invalid Plaid Link URL: missing link token");
    expect(result.current.isConnecting).toBe(false);
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toContain("Network error");
    expect(result.current.isConnecting).toBe(false);
  });

  it("should handle load data successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const onLoadComplete = vi.fn();
    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
        onLoadComplete,
      })
    );

    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.load();
    });

    expect(onLoadComplete).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should handle load data failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Load failed",
    } as Response);

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe("Load failed: Load failed");
    expect(result.current.isLoading).toBe(false);
  });

  it("should handle disconnect successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const onDisconnectComplete = vi.fn();
    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
        onDisconnectComplete,
      })
    );

    expect(result.current.isDisconnecting).toBe(false);

    await act(async () => {
      await result.current.disconnect();
    });

    expect(onDisconnectComplete).toHaveBeenCalled();
    expect(result.current.isDisconnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should handle disconnect failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Disconnect failed",
    } as Response);

    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.error).toBe("Disconnect failed: Disconnect failed");
    expect(result.current.isDisconnecting).toBe(false);
  });

  it("should expose correct type through UseDataConnectorHelpers", () => {
    const { result } = renderHook(() =>
      useDataConnector({
        connectorId: "test-connector",
      })
    );

    // Verify all expected properties are present
    expect(result.current).toHaveProperty("connect");
    expect(result.current).toHaveProperty("load");
    expect(result.current).toHaveProperty("disconnect");
    expect(result.current).toHaveProperty("operation");
    expect(result.current).toHaveProperty("isConnecting");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("isDisconnecting");
    expect(result.current).toHaveProperty("isBusy");
    expect(result.current).toHaveProperty("error");
    expect(result.current).toHaveProperty("setError");

    // Verify types
    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.load).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
    expect(typeof result.current.isConnecting).toBe("boolean");
    expect(typeof result.current.isLoading).toBe("boolean");
    expect(typeof result.current.isDisconnecting).toBe("boolean");
    expect(typeof result.current.isBusy).toBe("boolean");
    expect(typeof result.current.setError).toBe("function");

    // Verify initial state
    expect(result.current.operation).toBeNull();
    expect(result.current.isBusy).toBe(false);
  });
});

