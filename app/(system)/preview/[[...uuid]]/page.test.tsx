/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import * as nextNavigation from "next/navigation";
import React from "react";
import { vi, type Mock } from "vitest";

import PreviewPage from "@/app/(system)/preview/[[...uuid]]/page";
import { compileModule } from "@/lib/ui-kit/code-compiler";

// Define a realistic DataSpec with sampleData
const mockDataSpec = {
  type: "data_spec",
  queries: [
    {
      name: "users",
      description: "Fetch all users from the database",
      query: "SELECT id, name, email, role FROM users",
      sampleData: [
        { id: 1, name: "John Doe", email: "john@example.com", role: "admin" },
        { id: 2, name: "Jane Smith", email: "jane@example.com", role: "user" },
        { id: 3, name: "Bob Johnson", email: "bob@example.com", role: "user" }
      ]
    }
  ]
};

let mockBundle: any;

global.fetch = vi.fn();

vi.mock("next/navigation", async () => ({
  ...(await vi.importActual("next/navigation")),
  useParams: vi.fn(),
}));

describe("PreviewPage", () => {
  beforeAll(async () => {
    // Compile a component that uses dataProxy.users()
    mockBundle = await compileModule({ 
      tsCode: `
        import React, { useState, useEffect } from 'react';
        export default function TestComponent({ dataProxy }) {
          const [users, setUsers] = useState([]);
          useEffect(() => {
            dataProxy.users().then(setUsers);
          }, [dataProxy]);
          return (
            <ul>
              {users.map(user => <li key={user.id}>{user.name} - {user.role}</li>)}
            </ul>
          );
        }
      `
    });
    mockBundle.dataSpec = mockDataSpec;
  });

  beforeEach(() => {
    (nextNavigation.useParams as Mock).mockReturnValue({ uuid: ["test-uuid"] });
    (fetch as Mock).mockReset();
  });

  it("renders UiRenderer and loads users from DataProxy", async () => {
    (fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBundle,
    });

    render(<PreviewPage />);

    await waitFor(() => {
      expect(screen.getByTestId("ui-renderer")).toBeInTheDocument();
      expect(screen.getByText("John Doe - admin")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith - user")).toBeInTheDocument();
      expect(screen.getByText("Bob Johnson - user")).toBeInTheDocument();
    });

    // Verify completion signal works for successful rendering
    await waitFor(() => {
      expect((window as any).isUIReady?.()).toBe(true);
    });
  });

  it("captures UIBundle errors and makes them available via window.getUIBundleError", async () => {
    // Create a bundle with an error-prone component
    const errorBundle = await compileModule({ tsCode: `
      import React from 'react';
      export default function ErrorComponent() {
        // This will cause a runtime error
        const result = (window as any).undefinedVariable.toString();
        return <div>{result}</div>;
      }
    `});
    errorBundle.dataSpec = mockDataSpec as any;

    (fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => errorBundle,
    });

    render(<PreviewPage />);

    // Wait for the error to be caught and stored
    await waitFor(() => {
      // Check that error UI is rendered
      expect(screen.getByText(/Cannot read properties of undefined \(reading 'toString'\)/)).toBeInTheDocument();
    });

    // Verify that the error is accessible via window.getUIBundleError
    const storedError = (window as any).getUIBundleError?.();
    expect(storedError).toBeDefined();
    expect(storedError.message).toContain("Cannot read properties of undefined (reading 'toString')");
    expect(storedError.originalError).toBeDefined();
    expect(storedError.uuid).toBe(errorBundle.uuid);

    // Verify completion signal works for error cases too
    await waitFor(() => {
      expect((window as any).isUIReady?.()).toBe(true);
    });
  });
}); 