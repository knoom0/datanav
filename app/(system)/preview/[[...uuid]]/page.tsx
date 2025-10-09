"use client";

import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { createMockDataProxy } from "@/components/data-proxy-client";
import { UiRenderer } from "@/components/ui-renderer";
import { UIBundle } from "@/lib/types";
import { UIBundleError } from "@/lib/ui-kit/ui-bundle";

// Add type declaration for window.setUIBundle and window.getUIBundleError
declare global {
  interface Window {
    setUIBundle: (bundle: UIBundle) => void;
    getUIBundleError: () => UIBundleError | null;
    isUIReady: () => boolean;
  }
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  fontSize: "16px"
};

const loaderStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  border: "4px solid #f3f3f3",
  borderTop: "4px solid #3498db",
  borderRadius: "50%",
  animation: "spin 1s linear infinite"
};

export default function PreviewPage() {
  const params = useParams();
  const uuid = Array.isArray(params.uuid) ? params.uuid[0] : params.uuid;
  const [uiBundle, setUIBundle] = useState<UIBundle | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const uiState = useRef<{ ready: boolean; error: UIBundleError | null }>({
    ready: false,
    error: null
  });

  useEffect(() => {
    // Set up window globals
    window.setUIBundle = (bundle: UIBundle) => {
      setUIBundle(bundle);
      uiState.current.error = null;
      uiState.current.ready = false;
    };

    window.getUIBundleError = () => uiState.current.error;
    window.isUIReady = () => uiState.current.ready;

    // Fetch UI bundle if uuid exists
    if (uuid) {
      fetch(`/api/ui-bundle/${uuid}`)
        .then(response => response.ok ? response.json() : null)
        .then(bundle => {
          if (bundle) setUIBundle(bundle);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [uuid]);

  if (isLoading) {
    return (
      <div style={centerStyle}>
        <div style={loaderStyle}></div>
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `
        }} />
      </div>
    );
  }

  if (uiBundle) {
    const dataProxy = createMockDataProxy(uiBundle.dataSpec);
    return (
      <UiRenderer 
        uiBundle={uiBundle} 
        dataProxy={dataProxy} 
        width="100%" 
        onError={(error: UIBundleError) => {
          uiState.current.error = error;
          uiState.current.ready = true;
        }}
        onLoad={() => {
          uiState.current.ready = true;
        }}
      />
    );
  }

  return (
    <div style={centerStyle}>
      <div>No UI bundle found</div>
    </div>
  );
} 