import { useState, useEffect, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";

import { DataConnectorInfo } from "@/lib/types";

const OAUTH_WINDOW_WIDTH = 500;
const OAUTH_WINDOW_HEIGHT = 600;

// Helper function to detect mobile devices
const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

interface UseDataConnectorOptions {
  connectorId: string;
  onConnectStart?: () => void;
  onConnectComplete?: (result: any) => void;
  onLoadComplete?: () => void;
  onDisconnectComplete?: () => void;
}

export type DataConnectorOperation = "connecting" | "loading" | "disconnecting" | null;

export interface UseDataConnectorHelpers {
  connect: () => Promise<DataConnectorInfo | null>;
  load: () => Promise<void>;
  disconnect: () => Promise<void>;
  operation: DataConnectorOperation;
  isConnecting: boolean;
  isLoading: boolean;
  isDisconnecting: boolean;
  isBusy: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

export function useDataConnector({
  connectorId,
  onConnectStart,
  onConnectComplete,
  onLoadComplete,
  onDisconnectComplete,
}: UseDataConnectorOptions): UseDataConnectorHelpers {
  const [operation, setOperation] = useState<DataConnectorOperation>(null);
  const [error, setError] = useState<string | null>(null);
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);

  // Derived states for convenience
  const isConnecting = operation === "connecting";
  const isLoading = operation === "loading";
  const isDisconnecting = operation === "disconnecting";
  const isBusy = operation !== null;

  // Configure Plaid Link
  const { open: openPlaidLink, ready: plaidLinkReady } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: (publicToken) => {
      handleAuthCallback(publicToken);
      setPlaidLinkToken(null);
    },
    onExit: (error) => {
      if (error) {
        setError(`Plaid Link error: ${error.error_message || "Unknown error"}`);
      }
      setOperation(null);
      setPlaidLinkToken(null);
    },
  });

  // Open Plaid Link when token is set and ready
  useEffect(() => {
    if (plaidLinkToken && plaidLinkReady) {
      openPlaidLink();
    }
  }, [plaidLinkToken, plaidLinkReady, openPlaidLink]);

  // Handle auth callback (OAuth or Plaid)
  const handleAuthCallback = useCallback(async (authCode: string) => {
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
        setError(`Failed to complete authentication: ${errorText}`);
        setOperation(null);
        return null;
      }

      const result = await response.json();
      onConnectComplete?.(result);
      setOperation(null);
      return result;
    } catch (error) {
      setError(`Failed to complete authentication: ${error}`);
      setOperation(null);
      return null;
    }
  }, [connectorId, onConnectComplete]);

  // Handle OAuth popup window
  const handleOAuthPopup = useCallback((authUrl: string) => {
    const authWindow = window.open(
      authUrl,
      "oauth",
      `width=${OAUTH_WINDOW_WIDTH},height=${OAUTH_WINDOW_HEIGHT},scrollbars=yes,resizable=yes`
    );

    if (!authWindow) {
      setError("Failed to open authentication window. Please allow popups for this site.");
      setOperation(null);
      return;
    }

    // Listen for OAuth callback
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "OAUTH_SUCCESS" && event.data.authCode) {
        window.removeEventListener("message", handleMessage);
        authWindow.close();
        handleAuthCallback(event.data.authCode);
      } else if (event.data.type === "OAUTH_ERROR") {
        window.removeEventListener("message", handleMessage);
        authWindow.close();
        setError(event.data.error || "Authentication failed");
        setOperation(null);
      }
    };

    window.addEventListener("message", handleMessage);

    // Handle window closed without completion
    const checkClosed = setInterval(() => {
      if (authWindow.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handleMessage);
        setOperation(null);
      }
    }, 1000);
  }, [handleAuthCallback]);

  // Main connect function
  const connect = useCallback(async (): Promise<DataConnectorInfo | null> => {
    setOperation("connecting");
    setError(null);
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
        setError(`Connection failed: ${errorText}`);
        setOperation(null);
        return null;
      }

      const result = await response.json();
      onConnectComplete?.(result);

      // Check if we need to handle auth flow
      if (!result.success && result.authInfo?.authUrl) {
        const authUrl = result.authInfo.authUrl;

        // Handle Plaid Link flow
        if (authUrl.startsWith("plaid://")) {
          const url = new URL(authUrl);
          const linkToken = url.searchParams.get("linkToken");

          if (!linkToken) {
            setError("Invalid Plaid Link URL: missing link token");
            setOperation(null);
            return null;
          }

          setPlaidLinkToken(linkToken);
          return null;
        }

        // Handle OAuth flow
        if (isMobileDevice()) {
          // Mobile: redirect to auth page
          sessionStorage.setItem("oauth_connector_id", connectorId);
          sessionStorage.setItem("oauth_return_url", window.location.href);
          window.location.href = authUrl;
          return null;
        }

        // Desktop: open popup
        handleOAuthPopup(authUrl);
        return null;
      }

      // Direct connection success (no auth needed)
      setOperation(null);
      return result;
    } catch (error) {
      setError(`Connection failed: ${error}`);
      setOperation(null);
      return null;
    }
  }, [connectorId, onConnectStart, onConnectComplete, handleOAuthPopup]);

  // Load data function
  const load = useCallback(async (): Promise<void> => {
    setOperation("loading");
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
        setError(`Load failed: ${errorText}`);
        setOperation(null);
        return;
      }

      onLoadComplete?.();
      setOperation(null);
    } catch (error) {
      setError(`Load failed: ${error}`);
      setOperation(null);
    }
  }, [connectorId, onLoadComplete]);

  // Disconnect function
  const disconnect = useCallback(async (): Promise<void> => {
    setOperation("disconnecting");
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
        setError(`Disconnect failed: ${errorText}`);
        setOperation(null);
        return;
      }

      onDisconnectComplete?.();
      setOperation(null);
    } catch (error) {
      setError(`Disconnect failed: ${error}`);
      setOperation(null);
    }
  }, [connectorId, onDisconnectComplete]);

  return {
    connect,
    load,
    disconnect,
    operation,
    isConnecting,
    isLoading,
    isDisconnecting,
    isBusy,
    error,
    setError,
  };
}

