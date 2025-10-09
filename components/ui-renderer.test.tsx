/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import { createMockDataProxy } from "@/components/data-proxy-client";
import { UiRenderer } from "@/components/ui-renderer";
import { DataSpec } from "@/lib/types";
import { compileModule } from "@/lib/ui-kit/code-compiler";
import { UIBundleError } from "@/lib/ui-kit/ui-bundle";

// Mock the config functions
vi.mock("@/lib/config", () => ({
  getConfig: () => ({
    packages: ["react"],
    agent: {},
    db: {},
  }),
  getImportMap: () => ({
    react: React,
  }),
}));

// Mock data for tests
const mockUsersData = [
  { id: 1, name: "John Doe", email: "john@example.com", role: "admin" },
  { id: 2, name: "Jane Smith", email: "jane@example.com", role: "user" },
  { id: 3, name: "Bob Johnson", email: "bob@example.com", role: "user" }
];

const mockProductsData = [
  { id: 1, name: "Laptop", price: 999.99, category: "Electronics" },
  { id: 2, name: "Coffee Mug", price: 12.99, category: "Home" },
  { id: 3, name: "Book", price: 24.99, category: "Education" }
];

const mockOrdersData = [
  { id: 1, userId: 1, productId: 1, quantity: 1, total: 999.99, status: "completed" },
  { id: 2, userId: 2, productId: 2, quantity: 2, total: 25.98, status: "pending" }
];

// Mock DataSpec
const mockDataSpec: DataSpec = {
  type: "data_spec",
  queries: [
    {
      name: "users",
      description: "Fetch all users from the database",
      query: "SELECT id, name, email, role FROM users",
      sampleData: mockUsersData
    },
    {
      name: "products",
      description: "Fetch all products with pricing",
      query: "SELECT id, name, price, category FROM products",
      sampleData: mockProductsData
    },
    {
      name: "orders",
      description: "Fetch order history with user and product details",
      query: "SELECT id, user_id, product_id, quantity, total, status FROM orders",
      sampleData: mockOrdersData
    }
  ]
};

describe("UiRenderer", () => {
  let mockDataProxy: any;
  let consoleSpy: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Create fresh mock data proxy for each test
    mockDataProxy = createMockDataProxy(mockDataSpec);
    
    // Suppress console errors for all tests (since we"re testing error scenarios)
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error after each test
    consoleSpy.mockRestore();
  });

  it("should render a simple component from a UIBundle", async () => {
    const simpleComponentCode = `
      import React from 'react';
      export default function SimpleComponent() {
        return <div>Hello, World!</div>;
      }
    `;
    const uiBundle = await compileModule({ tsCode: simpleComponentCode });
    render(<UiRenderer uiBundle={uiBundle} />);

    await waitFor(() => {
      expect(screen.getByText("Hello, World!")).toBeInTheDocument();
    });
  });

  it("should render a component with mock data proxy using Users query", async () => {
    const componentWithDataCode = `
      import React, { useState, useEffect } from 'react';
      export default function ComponentWithData({ dataProxy }) {
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
    `;

    const uiBundle = await compileModule({ tsCode: componentWithDataCode });
    uiBundle.dataSpec = mockDataSpec;

    render(<UiRenderer uiBundle={uiBundle} dataProxy={mockDataProxy} />);

    await waitFor(() => {
      expect(screen.getByText("John Doe - admin")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith - user")).toBeInTheDocument();
      expect(screen.getByText("Bob Johnson - user")).toBeInTheDocument();
    });
  });

  it("should handle component runtime errors and call onError with UIBundleError", async () => {
    const onErrorMock = vi.fn();
    const errorComponentCode = `
      import React from 'react';
      export default function ErrorComponent() {
        // This will throw a ReferenceError at runtime
        const result = (window as any).undefinedVariable.toString();
        return <div>{result}</div>;
      }
    `;

    const uiBundle = await compileModule({ tsCode: errorComponentCode });
    render(<UiRenderer uiBundle={uiBundle} onError={onErrorMock} />);

    await waitFor(() => {
      // Check that error message is displayed in the UI
      expect(screen.getByText(/Cannot read properties of undefined \(reading 'toString'\)/)).toBeInTheDocument();
    });

    // Verify that onError was called with a UIBundleError
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    const calledError: UIBundleError = onErrorMock.mock.calls[0][0];
    expect(calledError.message).toContain("Cannot read properties of undefined (reading 'toString')");
    expect(calledError.uuid).toBe(uiBundle.uuid);
    expect(calledError.uiBundle).toBe(uiBundle);
    expect(calledError.originalError).toBeInstanceOf(TypeError);
  });

  it("should handle component import/loading errors and call onError", async () => {
    const onErrorMock = vi.fn();
    
    // Create a component that will fail during the loading phase
    const invalidCompiledCode = `
      // This will cause a ReferenceError during module loading
      const invalidVar = nonExistentGlobalVariable.toString();
      function TestComponent() {
        return React.createElement('div', null, 'Hello');
      }
      exports.default = TestComponent;
    `;

    const uiBundle = {
      type: "ui_bundle" as const,
      uuid: "test-uuid",
      sourceCode: "original source",
      compiledCode: invalidCompiledCode,
      sourceMap: {},
      dataSpec: mockDataSpec
    };

    render(<UiRenderer uiBundle={uiBundle} onError={onErrorMock} />);

    await waitFor(() => {
      // Check that error message is displayed in the UI
      expect(screen.getByText(/nonExistentGlobalVariable/)).toBeInTheDocument();
    });

    // Verify that onError was called with a UIBundleError for loading phase
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    const calledError: UIBundleError = onErrorMock.mock.calls[0][0];
    expect(calledError.message).toContain("nonExistentGlobalVariable");
    expect(calledError.uiBundle).toBe(uiBundle);
    expect(calledError.originalError).toBeInstanceOf(ReferenceError);
    expect(calledError.uuid).toBe(uiBundle.uuid);
  });

}); 