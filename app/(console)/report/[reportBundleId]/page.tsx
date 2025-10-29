"use client";

import { Stack, Title, Loader, Text, Paper, Button, Group } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ReportRenderer } from "@/components/report-renderer";
import type { ReportBundle } from "@/lib/types";

interface ReportBundleResponse {
  id: string;
  bundle: {
    text: string;
    dataQueryResults: Array<{
      name: string;
      description: string;
      query: string;
      records: Record<string, any>[];
    }>;
  };
  createdAt: string;
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportBundleId = params.reportBundleId as string;

  const [reportBundle, setReportBundle] = useState<ReportBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/report/${reportBundleId}`);

      if (!response.ok) {
        const errorText = await response.text();
        setError(`Failed to load report: ${errorText}`);
        setIsLoading(false);
        return;
      }

      const data: ReportBundleResponse = await response.json();

      // Convert to ReportBundle format
      const bundle: ReportBundle = {
        type: "report_bundle",
        text: data.bundle.text,
        dataQueryResults: data.bundle.dataQueryResults
      };

      setReportBundle(bundle);
      setIsLoading(false);
    };

    fetchReport();
  }, [reportBundleId]);

  const handleBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <Stack align="center" gap="md" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading report...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="md" py="xl">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={handleBack}
        >
          Back
        </Button>
        <Paper withBorder p="xl" bg="red.0">
          <Title order={3} c="red.7" mb="md">
            Error Loading Report
          </Title>
          <Text c="red.6">{error}</Text>
        </Paper>
      </Stack>
    );
  }

  if (!reportBundle) {
    return (
      <Stack gap="md" py="xl">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={handleBack}
        >
          Back
        </Button>
        <Paper withBorder p="xl">
          <Text c="dimmed">Report not found</Text>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap="md" py="md">
      <Group>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={handleBack}
        >
          Back
        </Button>
      </Group>
      <ReportRenderer reportBundle={reportBundle} />
    </Stack>
  );
}

