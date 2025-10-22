import { getConfig } from "@/lib/config";
import { UIBundle } from "@/lib/types";
import { compileModule } from "@/lib/ui-kit/code-compiler";
import { UIBundleError, loadUIBundle, renderStackContext } from "@/lib/ui-kit/ui-bundle";

// Mock stack trace data for testing
const mockStackTrace = `ReferenceError: undefinedVariable is not defined
    at eval (temp.tsx:3:18)
    at Function.module.exports [as compile] (<anonymous>:1:1)
    at Object.<anonymous> (<anonymous>:1:1)`;

// Create UIBundles for testing
let mockUIBundle: UIBundle;
let mockUIBundleWithError: UIBundle;
let mockUIBundleWithoutSourceMap: UIBundle;
let validBundle: UIBundle;
let invalidBundle: UIBundle;
let bundleWithoutDefaultExport: UIBundle;

beforeAll(async () => {
  // Create a bundle that works
  mockUIBundle = await compileModule({
    tsCode: `// Line 1: Comment
console.log('Line 2');
function TestComponent() {
  return 'Hello';
}
export default TestComponent;`,
    filename: "temp.tsx",
    skipTestLoading: true
  });
  mockUIBundle.uuid = "test-uuid-123";
  
  // Create a bundle with an error (we'll manually set this up)
  mockUIBundleWithError = await compileModule({
    tsCode: `// Line 1: Comment
console.log('Line 2');
console.log((window as any).undefinedVariable.toString());
function TestComponent() {
  return 'Hello';
}
export default TestComponent;`,
    filename: "temp.tsx",
    skipTestLoading: true
  });
  // Override the compiled code to introduce an error
  mockUIBundleWithError.compiledCode = `console.log('Line 2');
console.log(undefinedVariable.toString());
function TestComponent() {
  return 'Hello';
}
exports.default = TestComponent;`;
  mockUIBundleWithError.uuid = "test-uuid-error";

  // Create a bundle without source map for testing
  mockUIBundleWithoutSourceMap = await compileModule({
    tsCode: "function TestComponent() { return \"Hello\"; }\nexport default TestComponent;",
    filename: "temp.tsx",
    skipTestLoading: true
  });
  // Remove source map for testing
  mockUIBundleWithoutSourceMap.sourceMap = null as any;
  mockUIBundleWithoutSourceMap.uuid = "test-uuid-456";

  // Create valid bundle
  validBundle = await compileModule({
    tsCode: `function TestComponent() { return 'Hello World'; }
export default TestComponent;`,
    filename: "valid-bundle.tsx"
  });
  validBundle.uuid = "valid-bundle-123";

  // Create invalid bundle (compile valid code then modify to introduce error)
  invalidBundle = await compileModule({
    tsCode: `function TestComponent() { return 'Hello'; }
export default TestComponent;`,
    filename: "invalid-bundle.tsx",
    skipTestLoading: true
  });
  // Override the compiled code to introduce an error
  invalidBundle.compiledCode = `console.log(undefinedVariable.toString());
function TestComponent() { return 'Hello'; }
exports.default = TestComponent;`;
  invalidBundle.uuid = "invalid-bundle-123";

  // Create bundle without default export
  bundleWithoutDefaultExport = await compileModule({
    tsCode: `function TestComponent() { return 'Hello'; }
export { TestComponent };`,
    filename: "no-default.tsx",
    skipTestLoading: true
  });
  // Override compiled code to actually not have a default export
  bundleWithoutDefaultExport.compiledCode = `function TestComponent() { return 'Hello'; }
exports.TestComponent = TestComponent;`;
  bundleWithoutDefaultExport.uuid = "no-default-123";
});

describe("UIBundleError", () => {
  describe("constructor", () => {
    it("should create UIBundleError with Error object", () => {
      const originalError = new ReferenceError("undefinedVariable is not defined");
      const error = new UIBundleError(originalError, mockUIBundle);

      expect(error).toBeInstanceOf(UIBundleError);
      expect(error.name).toBe("UIBundleError");
      expect(error.message).toBe("undefinedVariable is not defined");
      expect(error.originalError).toBe(originalError);
      expect(error.uiBundle).toBe(mockUIBundle);
      expect(error.uuid).toBe("test-uuid-123");
    });

    it("should create UIBundleError with string error", () => {
      const error = new UIBundleError("Custom error message", mockUIBundle);

      expect(error).toBeInstanceOf(UIBundleError);
      expect(error.name).toBe("UIBundleError");
      expect(error.message).toBe("Custom error message");
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.originalError.message).toBe("Custom error message");
      expect(error.uiBundle).toBe(mockUIBundle);
    });
  });

  describe("uuid getter", () => {
    it("should return the UUID of the associated UIBundle", () => {
      const error = new UIBundleError("test error", mockUIBundle);
      expect(error.uuid).toBe("test-uuid-123");
    });
  });

  describe("toString method", () => {
    it("should return basic error string when no source map is available", () => {
      const originalError = new ReferenceError("undefinedVariable is not defined");
      originalError.stack = mockStackTrace;
      
      const error = new UIBundleError(originalError, mockUIBundleWithoutSourceMap);
      const result = error.toString();

      expect(result).toBe("ReferenceError: undefinedVariable is not defined");
    });

    it("should return enhanced error string with source map and stack context", () => {
      const originalError = new ReferenceError("undefinedVariable is not defined");
      originalError.stack = mockStackTrace;
      
      const error = new UIBundleError(originalError, mockUIBundleWithError);
      const result = error.toString();

      expect(result).toContain("ReferenceError: undefinedVariable is not defined");
      expect(result).toContain("temp.tsx");
    });
  });
});

describe("renderStackContext", () => {
  it("should throw error when stack trace is empty", () => {
    expect(() => renderStackContext("", mockUIBundle)).toThrow("Stack trace is required for renderStackContext");
  });

  it("should throw error when UIBundle has no source map", () => {
    expect(() => renderStackContext(mockStackTrace, mockUIBundleWithoutSourceMap))
      .toThrow("UIBundle must have a sourceMap for renderStackContext");
  });

  it("should render formatted context with line numbers and pointer", () => {
    const result = renderStackContext(mockStackTrace, mockUIBundleWithError);
    
    expect(result).toContain("2 | console.log('Line 2');");
    expect(result).toContain("> 3 | console.log((window as any).undefinedVariable.toString());");
    expect(result).toContain("^"); // Pointer to the error column
    expect(result).toContain("at eval (temp.tsx:3:18)");
  });
});

describe("loadUIBundle", () => {

  describe("successful execution", () => {
    it("should load and return a valid component function", () => {
      const result = loadUIBundle(validBundle);
      
      expect(typeof result).toBe("function");
      expect(result()).toBe("Hello World");
    });

    it("should work with custom imports", async () => {
      const customImports = {
        "custom": { customHelper: () => "Custom Result" },
        ...getConfig().packages  // Include existing packages
      };
      const bundleWithImports = await compileModule({
        tsCode: `import { customHelper } from 'custom';
function TestComponent() { return customHelper(); }
export default TestComponent;`,
        filename: "imports-bundle.tsx",
        imports: customImports,  // Provide the imports during compilation
        skipTestLoading: true  // Skip test loading since we"re testing loadUIBundle manually
      });
      bundleWithImports.uuid = "imports-bundle-123";

      const result = loadUIBundle(bundleWithImports, customImports);
      expect(result()).toBe("Custom Result");
    });
  });

  describe("error handling", () => {
    it("should throw UIBundleError when code contains runtime error during module loading", () => {
      expect(() => loadUIBundle(invalidBundle)).toThrow(UIBundleError);
      
      try {
        loadUIBundle(invalidBundle);
      } catch (error) {
        const uiBundleError = error as UIBundleError;
        expect(uiBundleError).toBeInstanceOf(UIBundleError);
        expect(uiBundleError.originalError).toBeInstanceOf(ReferenceError);
        expect(uiBundleError.originalError.message).toContain("undefinedVariable is not defined");
        expect(uiBundleError.uiBundle).toBe(invalidBundle);
        expect(typeof uiBundleError.toString()).toBe("string");
        expect(uiBundleError.toString()).toContain("ReferenceError");
      }
    });

    it("should throw UIBundleError when module does not export a default function", () => {
      expect(() => loadUIBundle(bundleWithoutDefaultExport)).toThrow(UIBundleError);
      
      try {
        loadUIBundle(bundleWithoutDefaultExport);
      } catch (error) {
        const uiBundleError = error as UIBundleError;
        expect(uiBundleError).toBeInstanceOf(UIBundleError);
        expect(uiBundleError.originalError.message).toContain("The code does not export a function");
        expect(uiBundleError.uiBundle).toBe(bundleWithoutDefaultExport);
      }
    });
  });
});
