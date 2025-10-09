import fs from "fs/promises";
import os from "os";
import path from "path";

import { z } from "zod/v3";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { DataSpec, ActionableError } from "@/lib/types";
import { compileModule } from "@/lib/ui-kit/code-compiler";
import { previewUI } from "@/lib/ui-kit/ui-tester";

export interface CompileOptions {
  enabled: boolean;
  dataSpec?: DataSpec;
}



export class TextEditorTool extends BaseAgentTool {
  readonly name: string;
  readonly description = `A text editor tool that can view, create, and modify text files.
Supports view, create, str_replace, insert, and undo_edit commands.
Please keep in mind that the line number markers prefixing each line when using view command are not part of the file content.`
  
  // Parameters matching Anthropic"s text editor tool exactly
  // See https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/text-editor-tool
  readonly inputSchema = z.object({
    command: z.enum(["view", "create", "str_replace", "insert", "undo_edit"]).describe("The command to execute"),
    path: z.string().describe("The file path to operate on"),
    file_text: z.string().optional().describe("The text content for create command"),
    old_str: z.string().optional().describe("The string to replace in str_replace command"),
    new_str: z.string().optional().describe("The new string to use in str_replace or insert commands"),
    insert_line: z.number().optional().describe("The line number to insert text at (one-indexed)"),
    view_range: z.array(z.number()).optional().describe("Range of lines to view [start_line, end_line] (one-indexed)")
  });

  private rootPath: string;
  private compileOptions: CompileOptions;
  private lastEditSnapshot: Map<string, { existedBefore: boolean; previousContent?: string }>;

  constructor({ rootPath, compileOptions, name = "text_editor" }: {
    rootPath?: string;
    compileOptions?: CompileOptions;
    name?: string;
  }) {
    super();
    this.rootPath = rootPath ?? ""; // Will be set asynchronously if not provided
    this.compileOptions = compileOptions ?? { enabled: false };
    this.name = name;
    this.lastEditSnapshot = new Map();
  }

  /**
   * Ensures the root path is initialized, creating a temporary directory if needed
   */
  private async ensureRootPath(): Promise<void> {
    if (!this.rootPath) {
      this.rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "text-editor-"));
    }
  }

  /**
   * Capture a snapshot of a file before modifying it to support undo_edit.
   */
  private async snapshotFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      this.lastEditSnapshot.set(filePath, { existedBefore: true, previousContent: content });
    } catch (error: any) {
      if (error && error.code === "ENOENT") {
        this.lastEditSnapshot.set(filePath, { existedBefore: false });
      } else {
        throw error;
      }
    }
  }

  /**
   * Implementation of the abstract executeInternal method from BaseAgentTool
   */
  protected async executeInternal(params: z.infer<typeof this.inputSchema>): Promise<any> {
    await this.ensureRootPath();
    const resultLines = [await this.executeTextEditorCommand(params)];
    
    // Compile and preview after any edit operation (only if compilation is enabled)
    if (this.compileOptions.enabled && (params.command === "str_replace" || params.command === "create" || params.command === "insert" || params.command === "undo_edit")) {
      try {
        await this.compileAndPreview(params.path);
        resultLines.push("Code compiles and executes without errors.");
      } catch (error) {
        resultLines.push(`But the following error occurred while executing the code:\n${error}`);
      }
    }

    return resultLines.join(" ");
  }

  /**
   * Internal implementation of text editor commands following Anthropic"s API
   */
  private async executeTextEditorCommand({
    command,
    path: relativePath,
    file_text,
    old_str,
    new_str,
    insert_line,
    view_range
  }: z.infer<typeof this.inputSchema>): Promise<string> {
    
    // Resolve the path relative to the root path
    const filePath = path.resolve(this.rootPath, relativePath);
    
    switch (command) {
    case "view": {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
        
      if (view_range && view_range.length === 2) {
        const [start, end] = view_range;
        const selectedLines = lines.slice(start - 1, end);
        return `Here are lines ${start}-${end} of ${relativePath}:\n${selectedLines.join("\n")}`;
      }
      
      if (view_range && view_range.length !== 2) {
        throw new ActionableError("view_range must contain exactly 2 elements: [start_line, end_line]");
      }
      // If the file is empty, say it is empty.
      if (lines.length === 0) {
        return `The file ${relativePath} is empty.`;
      }
          
      return `Here is the content of ${relativePath}:\n${lines.join("\n")}`;
    }
    case "create": {
      if (!file_text) {
        throw new ActionableError("file_text is required for create command");
      }
        
      // Create directory if it doesn"t exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      // Snapshot prior state (file may or may not exist)
      await this.snapshotFile(filePath);

      await fs.writeFile(filePath, file_text, "utf-8");
        
      return `File ${relativePath} has been created successfully.`;
    }

    case "str_replace": {
      if (!old_str || new_str === undefined) {
        throw new ActionableError("old_str and new_str are required for str_replace command");
      }
        
      const content = await fs.readFile(filePath, "utf-8");
        
      if (!content.includes(old_str)) {
        throw new ActionableError(`The string to replace was not found in ${relativePath}`);
      }
        
      // Snapshot prior content
      await this.snapshotFile(filePath);

      const newContent = content.replace(old_str, new_str);
      await fs.writeFile(filePath, newContent, "utf-8");
        
      return `String replacement completed in ${relativePath}.`;
    }

    case "insert": {
      if (!new_str || insert_line === undefined) {
        throw new ActionableError("new_str and insert_line are required for insert command");
      }
        
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
        
      if (insert_line < 1 || insert_line > lines.length + 1) {
        throw new ActionableError(`Insert line ${insert_line} is out of range. File has ${lines.length} lines.`);
      }
        
      // Snapshot prior content
      await this.snapshotFile(filePath);

      lines.splice(insert_line - 1, 0, new_str);
      const newContent = lines.join("\n");
      await fs.writeFile(filePath, newContent, "utf-8");
        
      return `Text inserted at line ${insert_line} in ${relativePath}.`;
    }

    case "undo_edit": {
      const snapshot = this.lastEditSnapshot.get(filePath);
      if (!snapshot) {
        return `No previous edit to undo for ${relativePath}.`;
      }

      if (snapshot.existedBefore) {
        await fs.writeFile(filePath, snapshot.previousContent ?? "", "utf-8");
      } else {
        try {
          await fs.unlink(filePath);
        } catch (error: any) {
          if (!(error && error.code === "ENOENT")) {
            throw error;
          }
        }
      }

      this.lastEditSnapshot.delete(filePath);
      return `Reverted last change to ${relativePath}.`;
    }

    default:
      throw new ActionableError(`Unknown command: ${command}`);
    }
  }

  /**
   * Get the root path of this text editor tool
   */
  async getRootPath(): Promise<string> {
    await this.ensureRootPath();
    return this.rootPath;
  }

  /**
   * Read a file using a relative path from the root directory
   */
  async readFileWithRelativePath(relativePath: string): Promise<string> {
    await this.ensureRootPath();
    const filePath = path.resolve(this.rootPath, relativePath);
    return await fs.readFile(filePath, "utf-8");
  }

  /**
   * Read a file using a relative path from the root directory
   * Alias for readFileWithRelativePath for convenience
   */
  async readFile(relativePath: string): Promise<string> {
    return this.readFileWithRelativePath(relativePath);
  }

  /**
   * Write a file using a relative path from the root directory
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    await this.ensureRootPath();
    const filePath = path.resolve(this.rootPath, relativePath);
    
    // Create directory if it doesn"t exist
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * Compiles the current code and generates a preview screenshot with sample data
   */
  async compileAndPreview(relativeFilePath: string): Promise<{ screenshot: Buffer }> {
    if (!this.compileOptions.dataSpec) {
      throw new Error("DataSpec is required for compilation but was not provided in compileOptions");
    }

    // Resolve the full path
    const filePath = path.resolve(this.rootPath, relativeFilePath);
    
    // Read the current code
    const sourceCode = await fs.readFile(filePath, "utf-8");
    
    // Compile the module
    const uiBundle = await compileModule({ filename: relativeFilePath, tsCode: sourceCode });
    uiBundle.dataSpec = this.compileOptions.dataSpec;
    
    // Preview the UI with sample data
    // TODO(moonk): Make the preview option configurable.
    const screenshotBuffer = await previewUI(uiBundle, {
      width: 480,
      height: 800,
      backgroundColor: "white"
    });
    
    return { screenshot: screenshotBuffer };
  }
}

/**
 * Factory function to create a text editor tool
 * @param options - Configuration options for the text editor tool
 * @param options.rootPath - Optional root path for resolving relative file paths (creates temp dir if not provided)
 * @param options.compileOptions - Optional compilation configuration including enablement and dataSpec
 * @returns A text editor tool object compatible with the AI SDK
 */
export function createTextEditorTool({
  rootPath,
  compileOptions
}: {
  rootPath?: string;
  compileOptions?: CompileOptions;
}) {
  return new TextEditorTool({ rootPath, compileOptions, name: "text_editor" });
}



