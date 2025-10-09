import { vi, beforeEach, describe, it, expect } from "vitest";

import { compileModule } from "@/lib/ui-kit/code-compiler";
import { previewUI } from "@/lib/ui-kit/ui-tester";

// Mock playwright - must use factory function to avoid hoisting issues  
vi.mock("playwright", () => {
  const mockPageInstance = {
    setViewportSize: vi.fn(),
    goto: vi.fn(),
    waitForLoadState: vi.fn(),
    evaluate: vi.fn(),
    waitForFunction: vi.fn(),
    on: vi.fn(),
    $: vi.fn().mockResolvedValue({
      isVisible: vi.fn().mockReturnValue(true),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot"))
    })
  };

  const mockBrowserInstance = {
    newContext: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(mockPageInstance)
    }),
    close: vi.fn()
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowserInstance)
    }
  };
});

describe("previewComponent", () => {
  const mockSourceCode = `
    export default function TestComponent() {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0f0f0'
        }}>
          <div style={{
            padding: '20px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            Test Component
          </div>
        </div>
      );
    }
  `;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use default options when none provided", async () => {
    const spec = await compileModule({ tsCode: mockSourceCode });
    const result = await previewUI(spec);
    expect(result).toBeInstanceOf(Buffer);
  }, 10000);

  it("should merge custom options with defaults", async () => {
    const customOptions = {
      width: 800,
      height: 600,
      scale: 2,
      backgroundColor: "black"
    };

    const spec = await compileModule({ tsCode: mockSourceCode });
    const result = await previewUI(spec, customOptions);
    expect(result).toBeInstanceOf(Buffer);
  });

  it("should compile and render valid component code", async () => {
    const validSourceCode = `
      export default function TestComponent() {
        return (
          <div>
            <h1>Test Component</h1>
            <p>This component works correctly</p>
          </div>
        );
      }
    `;
    
    const spec = await compileModule({ tsCode: validSourceCode });
    const result = await previewUI(spec);
    expect(result).toBeInstanceOf(Buffer);
  });

  it("should handle component with props correctly", async () => {
    const componentWithProps = `
      export default function TestComponent({ title = "Default Title" }) {
        return (
          <div>
            <h1>{title}</h1>
            <p>Component with props</p>
          </div>
        );
      }
    `;
    
    const spec = await compileModule({ tsCode: componentWithProps });
    const result = await previewUI(spec);
    expect(result).toBeInstanceOf(Buffer);
  });

});
