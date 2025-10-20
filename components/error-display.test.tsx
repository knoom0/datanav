/**
 * @vitest-environment jsdom
 */
import { MantineProvider } from "@mantine/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ErrorDisplay } from "./error-display";

// Wrapper component for Mantine provider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

describe("ErrorDisplay", () => {
  let mockWindowOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock window.open
    mockWindowOpen = vi.fn();
    window.open = mockWindowOpen as any;
  });
  it("should render error message", () => {
    const error = new Error("Test error message");
    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    expect(screen.getByText("Test error message", { exact: false })).toBeInTheDocument();
  });

  it("should show view details button", () => {
    const error = new Error("Test error");
    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    expect(screen.getByText("View Details")).toBeInTheDocument();
  });

  it("should automatically search for issues when modal opens", async () => {
    const error = new Error("Test error");
    
    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: []
        }),
      })
    ) as any;

    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    // Should automatically trigger search
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it("should open modal when view details clicked", async () => {
    const error = new Error("Test error message");
    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    await waitFor(() => {
      expect(screen.getByText("Error Details")).toBeInTheDocument();
    });
  });

  it("should display collapsible details section with stack trace and context", async () => {
    const error = new Error("Test error");
    error.stack = "Error: Test error\n  at someFunction (file.ts:10:5)";
    render(
      <TestWrapper>
        <ErrorDisplay error={error} context="Additional context information" />
      </TestWrapper>
    );

    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });

    // Details header should be present
    const detailsHeader = screen.getByText("Details");
    expect(detailsHeader).toBeInTheDocument();

    // Details content is in the document (Mantine Collapse renders it but hides with CSS)
    // Just verify it exists
    expect(screen.getByText(/at someFunction/)).toBeInTheDocument();
    expect(screen.getByText("Additional context information")).toBeInTheDocument();

    // Click to expand details
    fireEvent.click(detailsHeader);

    // Details should still be visible after clicking
    await waitFor(() => {
      expect(screen.getByText(/at someFunction/)).toBeInTheDocument();
      expect(screen.getByText("Additional context information")).toBeInTheDocument();
    });
  });

  it("should show details section when only context is provided", async () => {
    const error = new Error("Test error");
    render(
      <TestWrapper>
        <ErrorDisplay error={error} context="Additional context information" />
      </TestWrapper>
    );

    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
      expect(screen.getByText("Additional context information")).toBeInTheDocument();
    });
  });

  it("should automatically display search results when modal opens", async () => {
    const error = new Error("Database connection failed");
    
    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              number: 123,
              title: "Database connection issue",
              html_url: "https://github.com/knoom0/datanav/issues/123",
              state: "open"
            }
          ]
        }),
      })
    ) as any;

    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    // Open modal
    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    // Should automatically show search results
    await waitFor(() => {
      expect(screen.getByText("Related Issues")).toBeInTheDocument();
      expect(screen.getByText(/#123: Database connection issue/)).toBeInTheDocument();
    });
  });

  it("should show create issue button when no related issues found", async () => {
    const error = new Error("Unique error");
    
    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: []
        }),
      })
    ) as any;

    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    // Open modal
    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    // Should automatically search and show no results
    await waitFor(() => {
      expect(screen.getByText("No existing issues found for this error.")).toBeInTheDocument();
      expect(screen.getByText("Create New Issue")).toBeInTheDocument();
    });
  });

  it("should open GitHub issue creation page when create issue clicked", async () => {
    const error = new Error("New error");
    error.stack = "Error: New error\n  at test.ts:1:1";
    
    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: []
        }),
      })
    ) as any;

    render(
      <TestWrapper>
        <ErrorDisplay error={error} context="Test context" />
      </TestWrapper>
    );

    // Open modal
    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    // Wait for automatic search to complete
    await waitFor(() => {
      expect(screen.getByText("Create New Issue")).toBeInTheDocument();
    });

    // Click create issue button
    const createButton = screen.getByText("Create New Issue");
    fireEvent.click(createButton);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.stringContaining("https://github.com/knoom0/datanav/issues/new"),
      "_blank"
    );
  });

  it("should handle default error message", () => {
    const error = new Error();
    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    expect(screen.getByText("An error occurred while processing your request.")).toBeInTheDocument();
  });

  it("should display loading state while searching", async () => {
    const error = new Error("Test error");
    
    // Mock fetch with delay
    global.fetch = vi.fn(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({ items: [] }),
          } as any);
        }, 100);
      })
    );

    render(
      <TestWrapper>
        <ErrorDisplay error={error} />
      </TestWrapper>
    );

    // Open modal
    const viewDetailsButton = screen.getByText("View Details");
    fireEvent.click(viewDetailsButton);

    // Should show loading text while searching
    await waitFor(() => {
      expect(screen.getByText("Searching for related issues...")).toBeInTheDocument();
    });

    // Eventually should complete and show results
    await waitFor(() => {
      expect(screen.queryByText("Searching for related issues...")).not.toBeInTheDocument();
    });
  });
});

