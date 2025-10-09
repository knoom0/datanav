import fs from "fs/promises";
import os from "os";
import path from "path";

import { vi } from "vitest";

import { TextEditorTool, CompileOptions } from "@/lib/agent/tool/text-editor";
import { DataSpec } from "@/lib/types";

// Mock the UI compilation and preview functions to avoid external dependencies
vi.mock("@/lib/ui-kit/code-compiler", () => ({
  compileModule: vi.fn().mockResolvedValue({ dataSpec: null })
}));

vi.mock("@/lib/ui-kit/ui-tester", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ui-kit/ui-tester")>("@/lib/ui-kit/ui-tester");
  return {
    ...actual,
    previewUI: vi.fn().mockResolvedValue(Buffer.from("mock-screenshot"))
  };
});

describe("TextEditorTool", () => {
  let tempDir: string;
  let testFilePath: string;
  let tool: TextEditorTool;
  const mockDataSpec: DataSpec = {
    type: "data_spec",
    queries: [],
  };
  const mockCompileOptions: CompileOptions = {
    enabled: true,
    dataSpec: mockDataSpec
  };

  beforeEach(async () => {
    // Create a temporary directory and file for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "text-editor-test-"));
    testFilePath = path.join(tempDir, "test-file.ts");
    tool = new TextEditorTool({ 
      rootPath: tempDir, 
      compileOptions: mockCompileOptions
    });
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("view command", () => {
    test("should view entire file content", async () => {
      const content = "function test() {\n  console.log('hello');\n}";
      await fs.writeFile(testFilePath, content, "utf-8");

      const result = await tool.execute({
        command: "view",
        path: "test-file.ts"
      });

      expect(result).toContain("Here is the content of");
      expect(result).toContain("function test() {");
      expect(result).toContain("  console.log('hello');");
      expect(result).toContain("}");
    });

    test("should view specific line range", async () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      await fs.writeFile(testFilePath, content, "utf-8");

      const result = await tool.execute({
        command: "view",
        path: "test-file.ts",
        view_range: [2, 4]
      });

      expect(result).toContain("Here are lines 2-4");
      expect(result).toContain("line2");
      expect(result).toContain("line3");
      expect(result).toContain("line4");
      expect(result).not.toContain("line1");
      expect(result).not.toContain("line5");
    });
  });

  describe("create command", () => {
    test("should create new file with content", async () => {
      const content = "export function newFunction() {\n  return \"hello\";\n}";
      
      const result = await tool.execute({
        command: "create",
        path: "test-file.ts",
        file_text: content
      });

      expect(result).toContain("has been created successfully");
      
      const fileContent = await fs.readFile(testFilePath, "utf-8");
      expect(fileContent).toBe(content);
    });

  });

  describe("str_replace command", () => {
    test("should replace string in file", async () => {
      const originalContent = "function test() {\n  console.log('old message');\n}";
      await fs.writeFile(testFilePath, originalContent, "utf-8");

      const result = await tool.execute({
        command: "str_replace",
        path: "test-file.ts",
        old_str: "console.log('old message');",
        new_str: "console.log('new message');"
      });

      expect(result).toContain("String replacement completed");
      
      const newContent = await fs.readFile(testFilePath, "utf-8");
      expect(newContent).toContain("console.log('new message');");
      expect(newContent).not.toContain("console.log('old message');");
    });

    test("should fail when old_str not found", async () => {
      const originalContent = "function test() {\n  console.log('hello');\n}";
      await fs.writeFile(testFilePath, originalContent, "utf-8");

      const result = await tool.execute({
        command: "str_replace",
        path: "test-file.ts",
        old_str: "console.log(\"nonexistent\");",
        new_str: "console.log(\"new\");"
      });

      const resultObj = JSON.parse(result);
      expect(resultObj.error).toContain("The string to replace was not found");
    });
  });

  describe("insert command", () => {
    test("should insert text at specified line", async () => {
      const originalContent = "line1\nline2\nline3";
      await fs.writeFile(testFilePath, originalContent, "utf-8");

      const result = await tool.execute({
        command: "insert",
        path: "test-file.ts",
        insert_line: 2,
        new_str: "inserted line"
      });

      expect(result).toContain("Text inserted at line 2");
      
      const newContent = await fs.readFile(testFilePath, "utf-8");
      const lines = newContent.split("\n");
      expect(lines[1]).toBe("inserted line");
      expect(lines[2]).toBe("line2");
    });

    test("should fail when insert_line is out of range", async () => {
      const originalContent = "line1\nline2";
      await fs.writeFile(testFilePath, originalContent, "utf-8");

      const result = await tool.execute({
        command: "insert",
        path: "test-file.ts",
        insert_line: 10,
        new_str: "inserted line"
      });

      const resultObj = JSON.parse(result);
      expect(resultObj.error).toContain("Insert line 10 is out of range");
    });
  });

  describe("undo_edit command", () => {
    test("should return no previous edit message when no edit was made", async () => {
      const result = await tool.execute({
        command: "undo_edit",
        path: "test-file.ts"
      });

      expect(result).toContain("No previous edit to undo for test-file.ts");
    });
  });

  describe("compilation and preview", () => {
    test("should include compilation status in result for edit commands", async () => {
      const originalContent = "export default function Component() {\n  return <div>Hello</div>;\n}";
      await fs.writeFile(testFilePath, originalContent, "utf-8");

      const result = await tool.execute({
        command: "str_replace",
        path: "test-file.ts",
        old_str: "Hello",
        new_str: "World"
      });

      expect(result).toContain("String replacement completed");
      expect(result).toContain("Code compiles and executes without errors");
    });
  });

  describe("new functionality", () => {
    test("should create temp directory when rootPath is not provided", async () => {
      const toolWithoutRoot = new TextEditorTool({});
      const rootPath = await toolWithoutRoot.getRootPath();
      
      expect(rootPath).toContain(os.tmpdir());
      expect(rootPath).toContain("text-editor-");
      
      // Verify the directory actually exists
      const stats = await fs.stat(rootPath);
      expect(stats.isDirectory()).toBe(true);
    });

    test("should disable compilation when compileOptions not provided", async () => {
      const toolWithoutCompile = new TextEditorTool({ rootPath: tempDir });
      const content = "test content";
      await fs.writeFile(testFilePath, content, "utf-8");

      const result = await toolWithoutCompile.execute({
        command: "str_replace",
        path: "test-file.ts",
        old_str: "test",
        new_str: "updated"
      });

      expect(result).toContain("String replacement completed");
      expect(result).not.toContain("Code compiled");
    });

    test("getRootPath should return the root path", async () => {
      expect(await tool.getRootPath()).toBe(tempDir);
    });

    test("readFileWithRelativePath should read file content", async () => {
      const content = "test file content";
      await fs.writeFile(testFilePath, content, "utf-8");
      
      const result = await tool.readFileWithRelativePath("test-file.ts");
      expect(result).toBe(content);
    });

    test("readFile should read file content (alias method)", async () => {
      const content = "test file content for readFile";
      await fs.writeFile(testFilePath, content, "utf-8");
      
      const result = await tool.readFile("test-file.ts");
      expect(result).toBe(content);
    });

    test("writeFile should write file content", async () => {
      const content = "new file content";
      
      await tool.writeFile("new-file.ts", content);
      
      const newFilePath = path.join(tempDir, "new-file.ts");
      const fileContent = await fs.readFile(newFilePath, "utf-8");
      expect(fileContent).toBe(content);
    });

    test("writeFile should create directories if they do not exist", async () => {
      const content = "nested file content";
      
      await tool.writeFile("nested/dir/file.ts", content);
      
      const nestedFilePath = path.join(tempDir, "nested", "dir", "file.ts");
      const fileContent = await fs.readFile(nestedFilePath, "utf-8");
      expect(fileContent).toBe(content);
    });
  });
});