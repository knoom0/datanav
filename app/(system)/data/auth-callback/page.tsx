"use client";

import { Container, Text, Stack, Loader, Alert, Paper } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Processing authentication...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const isPopup = window.opener !== null;

    const handleError = (errorMsg: string) => {
      setStatus("error");
      setMessage(errorMsg);
      
      if (isPopup) {
        // Desktop: Send error to parent window
        window.opener.postMessage({
          type: "OAUTH_ERROR",
          error: errorMsg
        }, window.location.origin);
      } else {
        // Mobile: Store error and redirect back
        const returnUrl = sessionStorage.getItem("oauth_return_url");
        sessionStorage.removeItem("oauth_connector_id");
        sessionStorage.removeItem("oauth_return_url");
        
        if (returnUrl) {
          setTimeout(() => {
            window.location.href = returnUrl;
          }, 2000);
        }
      }
    };

    const handleSuccess = async (authCode: string) => {
      setStatus("success");
      setMessage("Authentication successful! Completing connection...");
      
      if (isPopup) {
        // Desktop: Send success with auth code to parent window
        window.opener.postMessage({
          type: "OAUTH_SUCCESS",
          authCode: code
        }, window.location.origin);
        
        // Close window after a brief delay
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        // Mobile: Complete the connection directly
        const connectorId = sessionStorage.getItem("oauth_connector_id");
        const returnUrl = sessionStorage.getItem("oauth_return_url");
        
        if (!connectorId) {
          handleError("Missing connector information");
          return;
        }

        const response = await fetch(`/api/data/${connectorId}/connect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ authCode }),
        });

        // TODO(moonk): streamify the response and show the connection progress

        if (!response.ok) {
          const errorText = await response.text();
          handleError(`Connection failed: ${errorText}`);
          return;
        }

        // Clear stored data
        sessionStorage.removeItem("oauth_connector_id");
        sessionStorage.removeItem("oauth_return_url");

        // Redirect back to the page
        setMessage("Connection complete! Redirecting...");
        setTimeout(() => {
          window.location.href = returnUrl || "/data";
        }, 1000);
      }
    };

    if (error) {
      handleError(errorDescription || error || "Authentication failed");
      return;
    }

    if (code) {
      handleSuccess(code);
      return;
    }

    // No code or error - something went wrong
    handleError("No authorization code received");
  }, [searchParams]);

  return (
    <Container size="sm" py="xl">
      <Paper p="xl" withBorder radius="md">
        <Stack align="center" gap="md">
          {status === "processing" && (
            <>
              <Loader size="lg" />
              <Text ta="center">{message}</Text>
            </>
          )}
          
          {status === "success" && (
            <>
              <IconCheck size={48} />
              <Text ta="center" fw={500}>
                {message}
              </Text>
              <Text ta="center" size="sm" c="dimmed">
                {window.opener ? "This window will close automatically." : "Redirecting you back..."}
              </Text>
            </>
          )}
          
          {status === "error" && (
            <>
              <IconX size={48} color="var(--mantine-color-red-6)" />
              <Alert color="red" ta="center">
                <Text fw={500}>Authentication Failed</Text>
                <Text size="sm">{message}</Text>
              </Alert>
              <Text ta="center" size="sm" c="dimmed">
                You can close this window and try again.
              </Text>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}

export default function DataConnectorCallbackPage() {
  return (
    <Suspense fallback={
      <Container size="sm" py="xl">
        <Paper p="xl" withBorder radius="md">
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text ta="center">Loading...</Text>
          </Stack>
        </Paper>
      </Container>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
