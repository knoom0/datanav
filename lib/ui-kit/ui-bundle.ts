import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import * as stackTraceParser from "stacktrace-parser";

import { getImportMap } from "@/lib/config";
import { ActionableError, UIBundle } from "@/lib/types";

// Maximum number of stack frames to include when rendering stack context
const MAX_STACK_CONTEXT_FRAMES = 5;

/**
 * Error class for UIBundle loading and rendering errors
 * Stores the UIBundle object and original error for better debugging
 */
export class UIBundleError extends ActionableError {
  public readonly originalError: Error;
  
  constructor(
    error: unknown,
    public readonly uiBundle: UIBundle
  ) {
    const originalError = error instanceof Error ? error : new Error(String(error));
    super(originalError.message);
    this.name = "UIBundleError";
    this.originalError = originalError;
  }
  
  /**
   * Get the UUID of the associated UIBundle
   */
  get uuid(): string {
    return this.uiBundle.uuid;
  }
  
  /**
   * Returns a detailed string representation of the error with context and original stack trace
   */
  toString(): string {
    let contextString = "";
    let stackTrace = this.originalError.stack || "";
    
    if (stackTrace && this.uiBundle.sourceMap) {
      stackTrace = toOriginalStackTrace({
        stack: stackTrace,
        sourceMap: this.uiBundle.sourceMap
      });
      contextString = renderStackContext(stackTrace, this.uiBundle);
    }
    
    return `${this.originalError.name}: ${this.originalError.message}${contextString}`;
  }
}

/**
 * Renders formatted context lines from a stack trace using StackTraceParser
 */
export function renderStackContext(stack: string, uiBundle: UIBundle): string {
  if (!stack) {
    throw new Error("Stack trace is required for renderStackContext");
  }
  
  if (!uiBundle.sourceMap) {
    throw new Error("UIBundle must have a sourceMap for renderStackContext");
  }
  
  const contextLines: string[] = [];
  const codeLines = uiBundle.sourceCode.split("\n");

  // Parse the stack trace using stacktrace-parser
  const frames = stackTraceParser.parse(stack);
  
  // Get the source file name from the source map
  const sourceMap = uiBundle.sourceMap as any;
  const sourceFileName = sourceMap.sources?.[0] || "temp.tsx";
  
  // Track which frames we"ve already added code snippets for
  const processedLines = new Set<number>();
  
  frames.slice(0, MAX_STACK_CONTEXT_FRAMES).forEach((frame) => {
    // Check if this frame matches our source file and has line information
    const isSourceFrame = frame.file && (
      frame.file.includes(sourceFileName) || 
      frame.file.includes("<anonymous>") ||
      frame.file.includes("eval")
    );
    
    // Add code snippet before the stack frame if it"s from our source and we haven"t processed this line yet
    if (isSourceFrame && frame.lineNumber && frame.column && !processedLines.has(frame.lineNumber)) {
      const lineNumber = frame.lineNumber;
      const columnNumber = frame.column;
      
      if (lineNumber > 0 && lineNumber <= codeLines.length) {
        // Mark this line as processed
        processedLines.add(lineNumber);
        
        // Add separator if this isn"t the first item
        if (contextLines.length > 0) {
          contextLines.push("");
        }
        
        // Calculate the maximum line number width for proper alignment
        const maxLineNum = Math.max(
          lineNumber > 1 ? lineNumber - 1 : 0,
          lineNumber,
          lineNumber < codeLines.length ? lineNumber + 1 : 0
        );
        const maxLineNumWidth = maxLineNum.toString().length;
        
        // Add line before (if exists)
        if (lineNumber > 1 && codeLines[lineNumber - 2]) {
          const prevLineNum = (lineNumber - 1).toString().padStart(maxLineNumWidth, " ");
          contextLines.push(`      ${prevLineNum} | ${codeLines[lineNumber - 2]}`);
        }
        
        // Add the problematic line
        const actualLine = codeLines[lineNumber - 1];
        if (actualLine) {
          const currentLineNum = lineNumber.toString().padStart(maxLineNumWidth, " ");
          contextLines.push(`    > ${currentLineNum} | ${actualLine}`);
          // Add pointer line with ^ at the correct column
          const pointerSpaces = " ".repeat(Math.max(0, columnNumber - 1));
          contextLines.push(`${" ".repeat(6 + maxLineNumWidth)} | ${pointerSpaces}^`);
        }
        
        // Add line after (if exists)
        if (lineNumber < codeLines.length && codeLines[lineNumber]) {
          const nextLineNum = (lineNumber + 1).toString().padStart(maxLineNumWidth, " ");
          contextLines.push(`      ${nextLineNum} | ${codeLines[lineNumber]}`);
        }
        
        contextLines.push(""); // Add separator after code snippet
      }
    }
    
    // Add the stack frame using formatStackFrame
    contextLines.push(formatStackFrame(frame));
  });
  
  return contextLines.length > 0 ? `\n${contextLines.join("\n")}` : "";
}

/**
 * Loads a compiled JavaScript component module and returns its default export.
 * @param bundle - The AIComponentSpec object containing compiledCode and dataSources.
 * @param imports - Object containing module imports.
 * @returns The default export from the executed module.
 */
export function loadUIBundle(bundle: UIBundle, imports: Record<string, any> = {}): any {
  const resolvedImports = Object.keys(imports).length === 0 ? getImportMap() : imports;
  const exports: Record<string, any> = {};

  try {
    const fn = createModuleFunction(bundle);
    fn(resolvedImports, exports);
    if (typeof exports.default !== "function") {
      throw new Error(`The code does not export a function. exports.default: ${exports.default}`);
    }
  } catch (error) {
    throw new UIBundleError(error, bundle);
  }

  return exports.default;
}

/**
 * Helper function to create a module function from a UIBundle's compiled code
 * @param uiBundle - The UIBundle containing compiled code
 * @returns Function that can be executed with imports and exports
 */
function createModuleFunction(uiBundle: UIBundle): any {
  const wrappedCode = `(function(imports, exports) { ${uiBundle.compiledCode} \n})`;
  return eval(wrappedCode);
}

/**
 * Converts a compiled JavaScript stack trace back to original TypeScript source locations
 * using the provided source map. This function is used internally by UIBundleError.toString().
 * 
 * @param params - Object containing the stack trace string and source map object
 * @param params.stack - The error stack trace string from compiled JavaScript
 * @param params.sourceMap - The source map object to use for mapping (required)
 * @returns A formatted stack trace string with original source locations
 */
function toOriginalStackTrace({
  stack,
  sourceMap
}: {
  stack: string;
  sourceMap: object;
}): string {
  // Extract error name and message from the first line
  const lines = stack.split("\n");
  const errorLine = lines[0] || "";
  
  // Parse the stack trace into individual frames
  const stackFrames = stackTraceParser.parse(stack);
  
  // Create TraceMap from the source map object
  let traceMap: TraceMap;
  try {
    traceMap = new TraceMap(sourceMap as any);
  } catch (error) {
    // Invalid source map - throw error since sourceMap is required
    throw new Error(`Invalid source map provided: ${error}`);
  }

  // Extract source file names from the source map for better frame detection
  const sourceFiles = new Set<string>();
  try {
    // Get the sources array from the source map
    const sourcesField = (sourceMap as any).sources;
    if (Array.isArray(sourcesField)) {
      sourcesField.forEach(source => {
        if (typeof source === "string") {
          sourceFiles.add(source);
        }
      });
    }
  } catch {
    // Ignore errors when extracting source files
  }

  // Build the new stack trace string
  const mappedLines: string[] = [errorLine]; // Start with error name and message
  
  for (const frame of stackFrames) {
    // Skip frames that don"t have line/column information
    if (!frame.lineNumber || frame.lineNumber <= 0) {
      // Include the original frame as-is
      mappedLines.push(formatStackFrame(frame));
      continue;
    }

    // Look for frames in eval"d code (our compiled code)
    // Now also check against source file names from the source map
    const isCompiledFrame = !frame.file || 
      frame.file.includes("<anonymous>") || 
      frame.file.includes("eval") ||
      (sourceFiles.size > 0 && Array.from(sourceFiles).some(sourceFile => frame.file?.includes(sourceFile))) ||
      frame.file.includes("temp.tsx");

    if (!isCompiledFrame) {
      // Include non-compiled frames as-is
      mappedLines.push(formatStackFrame(frame));
      continue;
    }

    try {
      // Try mapping with 1-based indexing first (most common)
      let originalPosition = originalPositionFor(traceMap, {
        line: frame.lineNumber,
        column: (frame as any).column || 0,
      });
      
      // If mapping failed, try with 0-based indexing
      if (!originalPosition || !originalPosition.source) {
        originalPosition = originalPositionFor(traceMap, {
          line: frame.lineNumber - 1,
          column: ((frame as any).column || 1) - 1,
        });
      }

      // If we successfully mapped to original source
      if (originalPosition && originalPosition.source && originalPosition.line) {
        const mappedFrame: stackTraceParser.StackFrame = {
          ...frame,
          file: originalPosition.source,
          lineNumber: originalPosition.line,
          column: originalPosition.column || (frame as any).column,
          methodName: originalPosition.name || frame.methodName
        };
        mappedLines.push(formatStackFrame(mappedFrame));
      } else {
        // Mapping failed, use original frame
        mappedLines.push(formatStackFrame(frame));
      }
    } catch {
      // Failed to map this frame - use original
      mappedLines.push(formatStackFrame(frame));
    }
  }

  return mappedLines.join("\n");
}

/**
 * Formats a stack frame into a standard stack trace line format.
 * @param frame - The stack frame to format
 * @returns A formatted stack trace line
 */
function formatStackFrame(frame: stackTraceParser.StackFrame): string {
  const methodName = frame.methodName || "<anonymous>";
  const fileName = frame.file || "<unknown>";
  const lineNumber = frame.lineNumber || 0;
  const column = (frame as any).column || 0;
  
  if (lineNumber > 0) {
    return `    at ${methodName} (${fileName}:${lineNumber}:${column})`;
  } else {
    return `    at ${methodName} (${fileName})`;
  }
}
