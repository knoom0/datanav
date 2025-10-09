import { randomUUID } from "crypto";
import path from "node:path";

import { Project, ScriptTarget, ModuleKind, ts } from "ts-morph";

import { getImportMap } from "@/lib/config";
import { UIBundle } from "@/lib/types";
import { loadUIBundle } from "@/lib/ui-kit/ui-bundle";

const VIRTUAL_TYPES_DIR = "virtual-types";

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }

  toString(): string {
    return `CompileError: ${this.message}`;
  }
}

// Helper function to strip ANSI color codes from strings
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function shimFor(name: string, obj: any) {
  // Make sure all properties of the object are exported from the module
  const properties = Object.keys(obj);
  const propertiesString = properties
    .filter(property => property !== "default" && property !== "module.exports")
    .map(property => `export const ${property}: any;`)
    .join("\n");
  return `
declare module "${name}" {
  const _default: any;
  export default _default;
  ${propertiesString}
}
`;
}

/**
 * Compiles a TypeScript function code string to JavaScript using ts-morph.
 * @param options - Transpilation options
 * @param options.tsCode - The TypeScript code string representing a function or module.
 * @param options.filename - The filename for the source file.
 * @param options.imports - The imports map used to create mock type files for modules during compilation.
 * @returns The compiled JavaScript code as a string.
 */
async function transpileToJSFunctionCode({
  tsCode,
  filename,
  imports,
}: {
  tsCode: string;
  filename: string;
  imports: Record<string, any>;
}): Promise<string> {
  // Create a new ts-morph project in memory
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ESNext,
      module: ModuleKind.NodeNext,
      esModuleInterop: true,
      allowJs: true,
      declaration: false,
      noEmitOnError: false,
      strict: false,
      jsx: ts.JsxEmit.React,
      // Re-enable source maps now that loadUIBundle handles them properly
      sourceMap: false,          // Don't generate .js.map files
      inlineSourceMap: true,     // Embed source map in JS as data URL
      inlineSources: true,       // Include original TypeScript source in map
      skipLibCheck: true,
      isolatedModules: true,     // helps when shimming
    },
    skipAddingFilesFromTsConfig: true,
  });

  // Create mock type files for modules in the imports map
  Object.entries(imports).forEach(([name, obj]) => {
    const fname = path.join(VIRTUAL_TYPES_DIR, `${name.replace(/[/@]/g, "_")}.d.ts`);
    project.createSourceFile(fname, shimFor(name, obj), { overwrite: true });
  });

  // Add a source file with the provided TypeScript code
  const sourceFile = project.createSourceFile(filename, tsCode, { overwrite: true });

  // Automatically add React import if JSX is present and React is not already imported
  const hasJSX =
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.JsxElement).length > 0 ||
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.JsxSelfClosingElement).length > 0;
  const hasReactImport = sourceFile.getImportDeclarations().some(
    (imp) => imp.getModuleSpecifierValue() === "react"
  );
  if (hasJSX && !hasReactImport) {
    sourceFile.addImportDeclaration({
      defaultImport: "React",
      moduleSpecifier: "react",
    });
  }

  const diags = project.getPreEmitDiagnostics();
  if (diags.length > 0) {
    // Filter out non-error diagnostics and convert to ts.Diagnostic objects
    const errorDiags = diags.filter(diag => diag.getCategory() === ts.DiagnosticCategory.Error);
    const diagsArray = errorDiags.map(diag => diag.compilerObject);
    const errorMessage = ts.formatDiagnosticsWithColorAndContext(
      diagsArray, 
      { 
        getCurrentDirectory: () => "/", 
        getCanonicalFileName: (fileName: string) => fileName, 
        getNewLine: () => "\n" 
      });
    throw new CompileError(stripAnsi(errorMessage));
  }

  // Replace all imports with assignments from "imports" object
  sourceFile.getImportDeclarations().forEach((importDecl) => {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const defaultImport = importDecl.getDefaultImport();
    const namedImports = importDecl.getNamedImports();
    const namespaceImport = importDecl.getNamespaceImport();

    let importStatement = "";

    if (defaultImport && namedImports.length > 0) {
      const names = namedImports.map(n => n.getName()).join(", ");
      importStatement = `const ${defaultImport.getText()} = imports["${moduleSpecifier}"];\nconst { ${names} } = imports["${moduleSpecifier}"];`;
    } else if (defaultImport) {
      importStatement = `const ${defaultImport.getText()} = imports["${moduleSpecifier}"];`;
    } else if (namedImports.length > 0) {
      const names = namedImports.map(n => n.getName()).join(", ");
      importStatement = `const { ${names} } = imports["${moduleSpecifier}"];`;
    } else if (namespaceImport) {
      importStatement = `const ${namespaceImport.getText()} = imports["${moduleSpecifier}"];`;
    } else {
      importStatement = `const ${moduleSpecifier} = imports["${moduleSpecifier}"];`;
    }

    importDecl.replaceWithText(importStatement);
  });

  // --- Helper to remove export/default from top-level declarations ---
  function removeExportModifiers() {
    sourceFile.getExportDeclarations().forEach(decl => decl.remove());
    sourceFile.getExportAssignments().forEach(decl => decl.remove());
    sourceFile.getFunctions().forEach(fn => {
      if (fn.isExported() && fn.getName()) fn.setIsExported(false);
    });
    sourceFile.getClasses().forEach(cls => {
      if (cls.isExported() && cls.getName()) cls.setIsExported(false);
    });
    sourceFile.getVariableStatements().forEach(vs => {
      if (vs.isExported()) vs.setIsExported(false);
    });
    sourceFile.getInterfaces().forEach(intf => {
      if (intf.isExported()) intf.setIsExported(false);
    });
    sourceFile.getTypeAliases().forEach(ta => {
      if (ta.isExported()) ta.setIsExported(false);
    });
  }

  // Handle default export robustly using AST, not regex
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
  if (defaultExportSymbol) {
    const decl = defaultExportSymbol.getDeclarations()[0];
    if (decl) {
      const kind = decl.getKindName();
      if ((kind === "FunctionDeclaration" || kind === "ClassDeclaration") && (decl as any).getName()) {
        const name = (decl as any).getName();
        if (name) {
          sourceFile.addStatements(`exports.default = ${name};`);
        }
      } else if (kind === "FunctionDeclaration" || kind === "ClassDeclaration") {
        const tempName = "__default";
        const declText = decl.getText();
        let replacement = "";
        if (kind === "FunctionDeclaration") {
          replacement = declText.replace(/export\s+default\s+()/, `const ${tempName} = $1`);
        } else if (kind === "ClassDeclaration") {
          replacement = declText.replace(/export\s+default\s+()/, `const ${tempName} = $1`);
        }
        decl.replaceWithText(replacement);
        sourceFile.addStatements(`exports.default = ${tempName};`);
      } else if (kind === "ExportAssignment") {
        const expr = (decl as any).getExpression ? (decl as any).getExpression().getText() : null;
        if (expr) {
          sourceFile.addStatements(`exports.default = ${expr};`);
        }
      } else {
        const text = decl.getText();
        const match = text.match(/^export\s+default\s+([\s\S]*);?$/);
        if (match) {
          sourceFile.addStatements(`exports.default = ${match[1]};`);
        }
      }
    }
  }

  // Remove all export declarations and export keywords (after export handling)
  removeExportModifiers();

  // Emit (compile) the file to JavaScript
  const emitResult = sourceFile.getEmitOutput();
  if (emitResult.getOutputFiles().length === 0) {
    throw new Error("Emit failed: No output files generated.");
  }

  // Get the compiled JavaScript code
  let jsCode = emitResult.getOutputFiles()[0].getText();
  
  // Add sourceURL comment for better debugging experience at the end
  // This helps browser dev tools and debuggers identify the dynamic code
  const sourceFileName = sourceFile.getBaseName();
  // Ensure proper line ending before adding sourceURL
  if (!jsCode.endsWith("\n")) {
    jsCode += "\n";
  }
  jsCode += `//# sourceURL=${sourceFileName}\n`;
  return jsCode;
}

/**
 * Extracts the source map object from compiled JavaScript code.
 * @param compiledCode - The compiled JavaScript code string containing an inline source map.
 * @returns The parsed source map object or null if no source map is found.
 */
function extractSourceMapFromCode(compiledCode: string): object | null {
  const match = compiledCode.match(/\/\/# sourceMappingURL=data:application\/json;base64,(.+)$/m);
  if (match) {
    try {
      const base64SourceMap = match[1];
      const sourceMapJson = Buffer.from(base64SourceMap, "base64").toString("utf-8");
      return JSON.parse(sourceMapJson);
    } catch (error) {
      console.warn("Failed to parse source map:", error);
      return null;
    }
  }
  return null;
}

/**
 * Compiles TypeScript code to a Function object and returns a UIBundle.
 * @param options - Compilation options
 * @param options.tsCode - The TypeScript code string representing a module.
 * @param options.filename - Optional filename for the source file (defaults to "temp.tsx").
 * @param options.imports - Optional imports map to use for module imports. If not provided, uses getImportMap().
 * @param options.skipTestLoading - Optional flag to skip test loading of the compiled code (defaults to false).
 * @returns The UIBundle containing sourceCode, compiledCode, sourceMap, and dataSpec.
 */
export async function compileModule({
  tsCode,
  filename = "temp.tsx",
  imports,
  skipTestLoading = false
}: {
  tsCode: string;
  filename?: string;
  imports?: Record<string, any>;
  skipTestLoading?: boolean;
}): Promise<UIBundle> {
  // Use provided imports or default to getImportMap()
  const resolvedImports = imports ?? getImportMap();

  // Compile the TypeScript code to JavaScript
  const jsCode = await transpileToJSFunctionCode({ tsCode, filename, imports: resolvedImports });

  // Check if compilation resulted in empty code
  if (!jsCode || jsCode.trim().length === 0) {
    throw new Error("Compilation resulted in empty JavaScript code. This might indicate a syntax error in the TypeScript code.");
  }

  // Extract source map object from compiled code
  const sourceMap = extractSourceMapFromCode(jsCode);
  
  // Ensure source map is available since we require it
  if (!sourceMap) {
    throw new Error("Source map generation failed. Source maps are required for proper error debugging.");
  }

  const uiBundle: UIBundle = {
    type: "ui_bundle",
    uuid: randomUUID(),
    sourceCode: tsCode,
    compiledCode: jsCode,
    sourceMap: sourceMap,
    dataSpec: { type: "data_spec", queries: [] },
  };

  // Test load the compiled code to check for syntax/runtime errors (unless disabled)
  if (!skipTestLoading) {
    loadUIBundle(uiBundle, resolvedImports);
  }

  return uiBundle;
}

/**
 * Maps a compiled stack trace back to original TypeScript source locations using source maps.
 * 
 * This utility function takes a JavaScript error stack trace from compiled code and maps it back
 * to the original TypeScript source locations using the provided source map object, returning
 * a formatted stack trace string that preserves the original error name and message.
 * 
 * @example
 * ```typescript
 * try {
 *   const bundle = await compileModule({ tsCode });
 *   const component = loadUIBundle(bundle);
 *   component(); // This might throw an error
 * } catch (error) {
 *   const originalStackTrace = getOriginalStackTrace({
 *     stack: error.stack,
 *     sourceMap: bundle.sourceMap
 *   });
 *   
 *   console.log(originalStackTrace);
 *   // Output:
 *   // TypeError: Cannot read properties of null (reading 'price')
 *   //     at helperFunction (temp.tsx:5:16)
 *   //     at mainFunction (temp.tsx:12:12)
 *   //     at Object.<anonymous> (eval:1:1)
 * }
 * ```
 */
