import { Loader } from "@mantine/core";
import { UIMessage } from "ai";
import React, { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { createDataProxyClient } from "@/components/data-proxy-client";
import { UIBundle, areSpecsEqual, UI_BUNDLE_PART_TYPE } from "@/lib/types";
import { UIBundleError, loadUIBundle } from "@/lib/ui-kit/ui-bundle";

type UiRendererProps = {
  message?: any;
  uiBundle?: UIBundle;
  dataProxy?: any;
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  onError?: (error: UIBundleError) => void;
  onLoad?: () => void;
};

type UIComponentInfo = {
  uiBundle: UIBundle | null;
  componentFn: React.ComponentType<any> | null;
};

export const getUIBundleFromMessage = (message: UIMessage): UIBundle | undefined => {
  for (const part of message.parts || []) {
    if (part.type === UI_BUNDLE_PART_TYPE) {
      return part.data as UIBundle;
    }
  }
  return undefined;
};

const getStatusText = (_message: UIMessage): string => {
  // TODO(moonk): Pass information on the currently running agent and render a status text base on the info
  return "Loading...";
};

const StatusRenderer: React.FC<{ message: UIMessage }> = ({ message }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Loader size="sm" variant="bars" />
      <span>{getStatusText(message)}</span>
    </div>
  );
};

export const UiRenderer: React.FC<UiRendererProps> = ({ 
  message, 
  uiBundle,
  dataProxy,
  width,
  height,
  style,
  onError,
  onLoad
}) => {
  const componentInfoRef = useRef<UIComponentInfo>({
    uiBundle: null,
    componentFn: null
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousSpecRef = useRef<UIBundle | null>(null);

  const errorRenderer = ({ error }: { error: Error }) => {
    const uiBundleError = new UIBundleError(
      error,
      componentInfoRef.current.uiBundle!
    );
    return <div>{uiBundleError.message}</div>;
  };

  useEffect(() => {
    let uiBundleToLoad: UIBundle | undefined;

    if (uiBundle) {
      uiBundleToLoad = uiBundle;
    } else if (message && (message as any).annotations) {
      uiBundleToLoad = getUIBundleFromMessage(message);
    }

    if (!uiBundleToLoad) return;

    // Only reset and re-render if the spec content hasn't changed
    if (uiBundleToLoad && previousSpecRef.current && areSpecsEqual(uiBundleToLoad, previousSpecRef.current) && isLoaded) return;

    previousSpecRef.current = uiBundleToLoad || null;
    setIsLoaded(false);

    try {
      const componentFn = loadUIBundle(uiBundleToLoad!);
      
      componentInfoRef.current = {
        uiBundle: uiBundleToLoad!,
        componentFn: componentFn
      };
      
      setIsLoaded(true);
      onLoad?.();
    } catch (error) {
      const uiBundleError = error instanceof UIBundleError ? error : new UIBundleError(
        error as Error,
        uiBundleToLoad!
      );
      setError(uiBundleError.message);
      onError?.(uiBundleError);
    }
     
  }, [message, uiBundle, dataProxy]);

  const containerStyle: React.CSSProperties = {
    width,
    height,
    ...style
  };

  return (
    <div style={containerStyle} data-testid="ui-renderer">
      {message && !isLoaded && <StatusRenderer message={message} />}
      <ErrorBoundary 
        FallbackComponent={errorRenderer}
        onError={(error) => {
          const uiBundleError = new UIBundleError(
            error,
            componentInfoRef.current.uiBundle!
          );
          onError?.(uiBundleError);
        }}
      >
        {isLoaded && componentInfoRef.current.componentFn && componentInfoRef.current.uiBundle && (
          React.createElement(componentInfoRef.current.componentFn, { 
            dataProxy: dataProxy || createDataProxyClient(
              componentInfoRef.current.uiBundle.uuid, 
              componentInfoRef.current.uiBundle.dataSpec
            ) 
          })
        )}
        {error && <div>{error}</div>}
      </ErrorBoundary>
    </div>
  );
};
