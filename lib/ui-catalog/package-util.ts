import fs from "fs/promises";
import path from "path";

import { readPackage, type NormalizedPackageJson } from "read-pkg";

import logger from "@/lib/logger";


/**
 * Using NormalizedPackageJson from read-pkg for better type safety and normalization
 */
export type PackageMetadata = NormalizedPackageJson;

/**
 * Locates and references a React component within a package, including export information and metadata
 */
export interface ComponentLocator {
  name: string;
  isDefaultExport: boolean;
  packageMetadata: PackageMetadata;
}

/**
 * Load package.json from both project and target package using read-pkg
 */
export async function loadPackageMetadata(packageName: string): Promise<{
  projectPackage: PackageMetadata;
  targetPackage: PackageMetadata | null;
}> {
  try {
    // Load project package.json from current directory
    const projectPackage = await readPackage({ cwd: process.cwd() }) as PackageMetadata;

    // Try to load target package"s package.json
    let targetPackage: PackageMetadata | null = null;
    try {
      const targetPackagePath = path.join(process.cwd(), "node_modules", packageName);
      targetPackage = await readPackage({ cwd: targetPackagePath }) as PackageMetadata;
    } catch (error) {
      logger.warn(`Could not read package.json for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { projectPackage, targetPackage };
  } catch (error) {
    throw new Error(`Failed to read package.json: ${error}`);
  }
}

/**
 * Format package metadata for display
 */
export function formatPackageInfo(packageMetadata: PackageMetadata): string {
  const lines = [
    `📦 Package: ${packageMetadata.name}@${packageMetadata.version}`,
  ];
  
  if (packageMetadata.description) {
    lines.push(`📝 Description: ${packageMetadata.description}`);
  }
  
  if (packageMetadata.homepage) {
    lines.push(`🏠 Homepage: ${packageMetadata.homepage}`);
  }
  
  if (packageMetadata.repository) {
    const repoUrl = typeof packageMetadata.repository === "string" 
      ? packageMetadata.repository 
      : packageMetadata.repository?.url;
    if (repoUrl) {
      lines.push(`📁 Repository: ${repoUrl}`);
    }
  }
  
  if (packageMetadata.license) {
    lines.push(`⚖️  License: ${packageMetadata.license}`);
  }
  
  if (packageMetadata.keywords && packageMetadata.keywords.length > 0) {
    lines.push(`🏷️  Keywords: ${packageMetadata.keywords.slice(0, 5).join(", ")}${packageMetadata.keywords.length > 5 ? "..." : ""}`);
  }
  
  return lines.join("\n");
}

/**
 * Extract all React components exported by a package through static analysis
 */
export async function extractReactComponents(packageName: string): Promise<ComponentLocator[]> {
  // Validate package exists and get metadata
  const packageMetadata = await validatePackageExists(packageName);
  
  try {
    // Determine entry points from package metadata
    const entryPoints = [];
    
    // Use package.json main/module fields if available
    if (packageMetadata.module) entryPoints.push(packageMetadata.module);
    if (packageMetadata.main) entryPoints.push(packageMetadata.main);
    if (packageMetadata.types) entryPoints.push(packageMetadata.types.replace(".d.ts", ".js"));
    
    // Add common fallback entry points
    entryPoints.push(
      "index.js",
      "index.ts",
      "index.tsx",
      "lib/index.js",
      "src/index.js",
      "dist/index.js",
      "es/index.js"
    );
    
    // Try to load the package and extract components
    const components = await findComponents(packageName, entryPoints, packageMetadata);
    
    return components;
  } catch (error) {
    throw new Error(`Failed to extract components from ${packageName}: ${error}`);
  }
}

/**
 * Validate that a package exists in package.json dependencies
 */
async function validatePackageExists(packageName: string): Promise<PackageMetadata> {
  try {
    const { projectPackage, targetPackage } = await loadPackageMetadata(packageName);
    
    const allDependencies = {
      ...projectPackage.dependencies,
      ...projectPackage.devDependencies,
      ...projectPackage.peerDependencies
    };
    
    if (!allDependencies[packageName]) {
      throw new Error(`Package "${packageName}" not found in package.json dependencies. Please install it first.`);
    }

    // Return the target package metadata for use in component indexing
    if (!targetPackage) {
      throw new Error(`Could not read package.json for "${packageName}". Package may be corrupted.`);
    }

    return targetPackage;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found in package.json")) {
      throw error;
    }
    throw new Error(`Failed to validate package ${packageName}: ${error}`);
  }
}

/**
 * Find React components using runtime analysis (dynamic imports)
 */
async function findComponents(packageName: string, entryPoints: string[], packageMetadata?: PackageMetadata): Promise<ComponentLocator[]> {
  const components: ComponentLocator[] = [];
  
  try {
    // Dynamically import the package
    const packageModule = await import(packageName);
    
    // Helper function to check if something is likely a React component
    const isReactComponent = (value: any, key: string): boolean => {
      if (!value) return false;
      
      // Function-based component check
      if (typeof value === "function") {
        // Check if name starts with uppercase (React convention)
        if (key && key[0] === key[0].toUpperCase()) return true;
        
        // Check for React-specific properties
        if (value.displayName || value.propTypes || value.defaultProps) return true;
        
        // Check if function name starts with uppercase
        if (value.name && value.name[0] === value.name[0].toUpperCase()) return true;
      }
      
      // React.forwardRef, React.memo, etc.
      if (typeof value === "object" && value !== null) {
        if (value.$$typeof || value.render || value.type) return true;
      }
      
      return false;
    };
    
    // Check default export
    if (packageModule.default && isReactComponent(packageModule.default, "default")) {
      components.push({
        name: packageModule.default.displayName || packageModule.default.name || "DefaultExport",
        isDefaultExport: true,
        packageMetadata: packageMetadata!
      });
    }
    
    // Check named exports
    for (const [exportName, value] of Object.entries(packageModule)) {
      if (exportName === "default") continue; // Already handled above
      
      if (isReactComponent(value, exportName)) {
        const componentName = (value as any)?.displayName || 
                             (value as any)?.name || 
                             exportName;
        
        components.push({
          name: componentName,
          isDefaultExport: false,
          packageMetadata: packageMetadata!
        });
      }
    }
    
    // Add package metadata if provided
    if (packageMetadata) {
      return components.map(component => ({
        ...component,
        packageMetadata
      }));
    }
    
    return components;
  } catch (error) {
    logger.warn(`Runtime analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    logger.info("Falling back to source file parsing...");
    
    // If dynamic import fails, try source file parsing as fallback
    const sourceComponents = await findComponentsFromSource(packageName, entryPoints, packageMetadata!);
    
    // Add package metadata if provided
    if (packageMetadata) {
      return sourceComponents.map(component => ({
        ...component,
        packageMetadata
      }));
    }
    
    return sourceComponents;
  }
}

/**
 * Find React components by parsing source files
 */
async function findComponentsFromSource(packageName: string, entryPoints: string[], packageMetadata: PackageMetadata): Promise<ComponentLocator[]> {
  const components: ComponentLocator[] = [];
  
  const packagePath = path.join(process.cwd(), "node_modules", packageName);
  
  // Try to find and read entry point files
  for (const entryPoint of entryPoints) {
    try {
      const filePath = path.join(packagePath, entryPoint);
      await fs.access(filePath);
      
      const content = await fs.readFile(filePath, "utf-8");
      
      // Simple regex patterns to find component exports
      const exportPatterns = [
        /export\s+(?:const|let|var|function)\s+([A-Z][a-zA-Z0-9]*)/g,
        /export\s+\{\s*([^}]*)\s*\}/g,
        /export\s+default\s+(?:function\s+)?([A-Z][a-zA-Z0-9]*)/g
      ];
      
      for (const pattern of exportPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const componentName = match[1];
          if (componentName && componentName[0] === componentName[0].toUpperCase()) {
            components.push({
              name: componentName,
              isDefaultExport: content.includes(`export default ${componentName}`),
              packageMetadata
            });
          }
        }
      }
      
      break; // If we successfully read one entry point, stop
    } catch {
      // Try next entry point
      continue;
    }
  }
  
  return components;
}



 