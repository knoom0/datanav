"use client";

import { Box, Drawer, Stack, Text } from "@mantine/core";
import type React from "react";

import { useTranslations } from "next-intl";

import { ReportRenderer } from "@/components/report-renderer";
import { UiRenderer } from "@/components/ui-renderer";
import logger from "@/lib/logger";

// Constants for drawer configuration
const DRAWER_HEIGHT_PERCENTAGE = 100;
const DRAWER_POSITION = "bottom";

const CenteredMessage = ({ children }: { children: React.ReactNode }) => (
  <Box
    h="100%"
    style={{
      display: "flex",
      alignItems: "center", 
      justifyContent: "center" 
    }}
    p="md"
  >
    <Text c="dimmed" ta="center">
      {children}
    </Text>
  </Box>
);

interface ArtifactViewProps {
  artifacts: any[];
  isOpen: boolean;
  onClose: () => void;
}

export function ArtifactView({ artifacts, isOpen, onClose }: ArtifactViewProps) {
  // Get the last artifact from the list
  logger.debug(`artifacts: ${JSON.stringify(artifacts)}`);
  const lastArtifact = artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
  const t = useTranslations();
  return (
    <Drawer
      opened={isOpen}
      onClose={onClose}
      position={DRAWER_POSITION}
      size={`${DRAWER_HEIGHT_PERCENTAGE}%`}
      withCloseButton={true}
      styles={{
        content: {
          borderTopLeftRadius: "12px",
          borderTopRightRadius: "12px",
          position: "relative",
        },
      }}
    >
      <Stack h="100%" gap={0}>
        {/* Content Area */}
        <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {!lastArtifact ? (
            <CenteredMessage>{t("No artifacts available")}</CenteredMessage>
          ) : lastArtifact.type === "ui_bundle" ? (
            <Box h="100%" p="md">
              <UiRenderer message={lastArtifact} width="100%" height="100%" />
            </Box>
          ) : lastArtifact.type === "report_bundle" ? (
            <Box h="100%">
              <ReportRenderer reportBundle={lastArtifact} />
            </Box>
          ) : (
            <CenteredMessage>
              {t("Unsupported artifact type: {{type}}", { type: lastArtifact.type })}
            </CenteredMessage>
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}
