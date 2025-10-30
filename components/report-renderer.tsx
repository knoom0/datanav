"use client";

import { BarChart, LineChart, PieChart, AreaChart } from "@mantine/charts";
import { Box, Container, Text, Code, Paper, Table, ScrollArea } from "@mantine/core";
import { format } from "date-fns";
import { ErrorBoundary } from "react-error-boundary";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import logger from "@/lib/logger";
import { DataChartConfig, type ReportBundle } from "@/lib/types";
import { parseDateTime, determineBestDateTimeFormat } from "@/lib/util/datetime-util";

// Constants
const PIE_SLICE_COLORS = [
  "blue", "red", "green", "orange", "purple", 
  "yellow", "pink", "brown", "gray", "black",
];

/**
 * Creates a tick formatter function for chart axes.
 * Automatically detects if values are datetimes and formats them appropriately.
 * Falls back to string conversion for non-datetime values.
 */
function createTickFormatter(
  data: Record<string, any>[],
  keyColumnName: string
): (value: any) => string {
  if (data.length === 0) {
    return (value: any) => String(value);
  }
  
  // Check if the key column contains datetime values
  const firstValue = data[0][keyColumnName];
  const firstDate = parseDateTime(firstValue);
  
  if (!firstDate) {
    // Not a datetime column, use default string formatting
    return (value: any) => String(value);
  }
  
  // Parse all dates to determine the best format
  const dates = data
    .map(record => parseDateTime(record[keyColumnName]))
    .filter((date): date is Date => date !== null);
  
  const formatPattern = determineBestDateTimeFormat(dates);
  
  // Return formatter function
  return (value: any) => {
    const date = parseDateTime(value);
    return date ? format(date, formatPattern) : String(value);
  };
}

// Utility function to calculate yAxisDomain based on query results
function calculateYAxisDomain(records: Record<string, any>[], seriesColumnNames: string[]): [number, number] {
  const minValue = 0; // Always start from 0
  
  // Extract all numeric values from the specified series columns
  const allValues: number[] = [];
  
  records.forEach(record => {
    seriesColumnNames.forEach(columnName => {
      const value = record[columnName];
      const parsedValue = Number(value);
      if (!isNaN(parsedValue)) {
        allValues.push(parsedValue);
      }
    });
  });
  
  // If no valid values found, return default range
  if (allValues.length === 0) {
    return [0, 100];
  }
  
  // Find the maximum value and multiply by 1.1 (110%)
  const maxValue = Math.max(...allValues);
  const adjustedMaxValue = Math.ceil(maxValue * 1.1);
  
  return [minValue, adjustedMaxValue];
}

/**
 * Sorts data points by their key column if the keys are numbers or dates.
 * Returns a sorted copy of the data array.
 */
function sortDataByKey(data: Record<string, any>[], keyColumnName: string): Record<string, any>[] {
  if (data.length === 0) {
    return data;
  }

  // Make a copy to avoid mutating the original array
  const sortedData = [...data];

  // Check if the key column contains dates
  const firstValue = data[0][keyColumnName];
  const firstDate = parseDateTime(firstValue);

  if (firstDate) {
    // Sort by date
    sortedData.sort((a, b) => {
      const dateA = parseDateTime(a[keyColumnName]);
      const dateB = parseDateTime(b[keyColumnName]);
      
      if (!dateA || !dateB) return 0;
      return dateA.getTime() - dateB.getTime();
    });
    return sortedData;
  }

  // Check if the key column contains numbers
  const firstNumber = Number(firstValue);
  if (!isNaN(firstNumber) && firstValue !== null && firstValue !== "") {
    // Verify that most values are numeric (at least 80%)
    const numericCount = data.filter(record => {
      const value = record[keyColumnName];
      return !isNaN(Number(value)) && value !== null && value !== "";
    }).length;
    
    if (numericCount / data.length >= 0.8) {
      // Sort by number
      sortedData.sort((a, b) => {
        const numA = Number(a[keyColumnName]);
        const numB = Number(b[keyColumnName]);
        return numA - numB;
      });
      return sortedData;
    }
  }

  // If neither date nor number, return original order
  return sortedData;
}

// Interface definition for pie chart data
interface PieDataItem {
  name: string;
  value: number;
  color: string;
}

// Parameters interface for pie chart data preparation
interface PreparePieChartDataParams {
  chartData: Record<string, any>[];
  keyColumnName: string;
  valueColumnName: string;
  maxSlices?: number;
}

// Utility function to prepare pie chart data with aggregation
function preparePieChartData({
  chartData,
  keyColumnName,
  valueColumnName,
  maxSlices = PIE_SLICE_COLORS.length
}: PreparePieChartDataParams): PieDataItem[] {
  // Transform and sort data by value (descending)
  const transformedData: PieDataItem[] = chartData
    .map((item: any, index: number) => {
      const name = item[keyColumnName] || `Item ${index + 1}`;
      const value = item[valueColumnName] || 0;
      return {
        name: String(name),
        value: Number(value),
        color: "" // Will be assigned below
      };
    })
    .sort((a: PieDataItem, b: PieDataItem) => b.value - a.value);

  if (transformedData.length <= maxSlices) {
    // If we have fewer items than the limit, use all data points
    return transformedData.map((item: PieDataItem, index: number) => ({
      ...item,
      color: PIE_SLICE_COLORS[index % PIE_SLICE_COLORS.length]
    }));
  } else {
    // Take top (maxSlices - 1) items and aggregate the rest into "Other"
    const topItems = transformedData.slice(0, maxSlices - 1);
    const otherItems = transformedData.slice(maxSlices - 1);
    
    const otherValue = otherItems.reduce((sum: number, item: PieDataItem) => sum + item.value, 0);
    
    return [
      ...topItems.map((item: PieDataItem, index: number) => ({
        ...item,
        color: PIE_SLICE_COLORS[index % (PIE_SLICE_COLORS.length - 1)] // Reserve last color for "Other"
      })),
      {
        name: "Other",
        value: otherValue,
        color: "gray"
      }
    ];
  }
}



interface ReportRendererProps {
  reportBundle: ReportBundle;
}

// Error fallback component for ErrorBoundary
function ReportErrorFallback({ error }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <Container size="md" h="100%" py="md">
      <Paper withBorder p="md" bg="red.0">
        <Text size="sm" fw={500} mb="xs" c="red.7">
          ❌ Report Error
        </Text>
        <Text size="sm" mb="md" c="red.6">
          {error.message}
        </Text>
        <Code block style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
          {error.stack}
        </Code>
      </Paper>
    </Container>
  );
}


function ChartRenderer({ 
  children, 
  language, 
  dataQueryResults 
}: { 
  children: string; 
  language?: string; 
  dataQueryResults?: any[];
}) {
  if (language === "summary") {
    // Render summary as a highlighted section
    return (
      <Paper withBorder p="md" mb="md" bg="yellow.0" style={{ borderLeftWidth: 4, borderLeftColor: "var(--mantine-color-yellow-6)" }}>
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {children}
        </Text>
      </Paper>
    );
  }

  if (language === "chart") {
    // Let JSON parsing errors bubble up to ErrorBoundary
    const chartConfig = JSON.parse(children) as DataChartConfig;
    logger.debug(`chartConfig: ${JSON.stringify(chartConfig)}`);
    
    // Strict validation: require dataQueryName in chart configuration
    if (!chartConfig.dataQueryName) {
      throw new Error("Chart configuration must specify a dataQueryName");
    }
    
    // Strict validation: require keyColumnName
    if (!chartConfig.keyColumnName) {
      throw new Error("Chart configuration must specify keyColumnName");
    }
    
    const queryName = chartConfig.dataQueryName;
    
    // Strict validation: require dataQueryResults to be available
    if (!dataQueryResults || dataQueryResults.length === 0) {
      throw new Error(`No data query results available for chart with dataQueryName: ${queryName}`);
    }
    
    // Find the matching query result
    const queryResult = dataQueryResults.find(result => result.name === queryName);
    
    // Strict validation: require the specific query result to exist
    if (!queryResult) {
      const availableQueries = dataQueryResults.map(r => r.name).join(", ");
      throw new Error(`Data query result not found for '${queryName}'. Available queries: ${availableQueries}`);
    }
    
    // Sort data by key column if keys are numbers or dates
    const chartData = sortDataByKey(queryResult.records, chartConfig.keyColumnName);

    // Determine series column names - use provided ones or fallback to first non-key column
    let seriesColumnNames = chartConfig.seriesColumnNames;
    
    if (!seriesColumnNames || seriesColumnNames.length === 0) {
      // Fallback: find the first non-key column from the data
      if (chartData.length > 0) {
        const allColumns = Object.keys(chartData[0]);
        const nonKeyColumns = allColumns.filter(col => col !== chartConfig.keyColumnName);
        
        if (nonKeyColumns.length > 0) {
          seriesColumnNames = [nonKeyColumns[0]]; // Use first non-key column
          logger.debug(`Using fallback series column: ${seriesColumnNames[0]}`);
        } else {
          throw new Error(`No non-key columns found for fallback. Key column: ${chartConfig.keyColumnName}, Available columns: ${allColumns.join(", ")}`);
        }
      } else {
        throw new Error("Cannot determine series columns: no data records available for fallback");
      }
    }

    // Build series configuration from seriesColumnNames
    const series = seriesColumnNames.map((columnName, index) => ({
      name: columnName,
      color: ["blue", "red", "green", "orange", "purple", "yellow"][index % 6]
    }));

    // Calculate yAxisDomain based on the data
    const yAxisDomain = calculateYAxisDomain(chartData, seriesColumnNames);

    // Create tick formatter for datetime values if applicable
    const tickFormatter = createTickFormatter(chartData, chartConfig.keyColumnName);

    // Render actual Mantine chart based on type
    const renderChart = () => {
      const CHART_HEIGHT = 300;
      const CHART_FONT_SIZE = 12;
      
      switch (chartConfig.type?.toLowerCase()) {
      case "line":
        return (
          <LineChart
            h={CHART_HEIGHT}
            data={chartData}
            dataKey={chartConfig.keyColumnName}
            series={series}
            withLegend
            xAxisProps={{ 
              fontSize: CHART_FONT_SIZE,
              tickFormatter
            }}
            yAxisProps={{ domain: yAxisDomain, fontSize: CHART_FONT_SIZE }}
            style={{ overflow: "hidden" }}
          />
        );
      case "area":
        return (
          <AreaChart
            h={CHART_HEIGHT}
            data={chartData}
            dataKey={chartConfig.keyColumnName}
            series={series}
            withLegend
            xAxisProps={{ 
              fontSize: CHART_FONT_SIZE,
              tickFormatter
            }}
            yAxisProps={{ domain: yAxisDomain, fontSize: CHART_FONT_SIZE }}
            style={{ overflow: "hidden" }}
          />
        );
      case "pie": {
        // Transform data for PieChart using the utility function
        const pieData = preparePieChartData({
          chartData,
          keyColumnName: chartConfig.keyColumnName,
          valueColumnName: seriesColumnNames[0]
        });

        return (
          <PieChart
            h={CHART_HEIGHT}
            w="100%"
            data={pieData}
            withLabels
            withTooltip
            tooltipDataSource="segment"
            labelsType="percent"
            style={{ overflow: "hidden" }}
          />
        );
      }
      case "bar":
      default:
        return (
          <BarChart
            h={CHART_HEIGHT}
            data={chartData}
            dataKey={chartConfig.keyColumnName}
            series={series}
            withLegend
            xAxisProps={{ 
              fontSize: CHART_FONT_SIZE,
              tickFormatter
            }}
            yAxisProps={{ domain: yAxisDomain, fontSize: CHART_FONT_SIZE }}
            style={{ overflow: "hidden" }}
          />
        );
      }
    };

    return (
      <Paper withBorder p="md" mb="sm" bg="blue.0" style={{ overflow: "hidden" }}>
        <Box style={{ overflow: "hidden", width: "100%" }}>
          {renderChart()}
        </Box>
      </Paper>
    );
  }
  
  // For other code blocks, use default styling
  return (
    <Code block mb="sm">
      {children}
    </Code>
  );
}

function ReportRendererInternal({ reportBundle }: ReportRendererProps) {
  // Extract data query results for charts
  const dataQueryResults = reportBundle.dataQueryResults;
  const allContent = reportBundle.text;

  return (
    <Container size="md" h="100%" p={0}>
      <ScrollArea h="100%" w="100%">
        <Box px="md">
          <ReactMarkdown
            components={{
              // Custom renderer for code blocks to handle charts
              code: ({ children, className }) => {
                const match = /language-(\w+)/.exec(className || "");
                const language = match ? match[1] : undefined;
                return (
                  <ChartRenderer language={language} dataQueryResults={dataQueryResults}>
                    {String(children).replace(/\n$/, "")}
                  </ChartRenderer>
                );
              },
              // Custom table renderers using Mantine Table
              table: ({ children }) => (
                <Table mb="md" striped>
                  {children}
                </Table>
              ),
              thead: ({ children }) => (
                <Table.Thead>
                  {children}
                </Table.Thead>
              ),
              tbody: ({ children }) => (
                <Table.Tbody>
                  {children}
                </Table.Tbody>
              ),
              tr: ({ children }) => (
                <Table.Tr>
                  {children}
                </Table.Tr>
              ),
              th: ({ children }) => (
                <Table.Th>
                  {children}
                </Table.Th>
              ),
              td: ({ children }) => (
                <Table.Td>
                  {children}
                </Table.Td>
              ),
            }}
            remarkPlugins={[remarkGfm]}
          >
            {allContent}
          </ReactMarkdown>
        </Box>
      </ScrollArea>
    </Container>
  );
}

// Export the main component wrapped with ErrorBoundary
export function ReportRenderer({ reportBundle }: ReportRendererProps) {
  return (
    <ErrorBoundary
      FallbackComponent={ReportErrorFallback}
      onError={(error, errorInfo) => {
        console.error("ReportRenderer Error:", error, errorInfo);
      }}
    >
      <ReportRendererInternal reportBundle={reportBundle} />
    </ErrorBoundary>
  );
}
