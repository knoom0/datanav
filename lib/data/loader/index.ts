import { DataLoader, DataLoaderConfig } from "@/lib/data/loader";
import { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";
import { SQLDataLoader } from "@/lib/data/loader/sql-data-loader";
import { DataLoaderInfo } from "@/lib/types";

/**
 * Registry of available data loader classes
 */
const DATA_LOADER_REGISTRY = [GoogleAPIDataLoader, SQLDataLoader] as const;

/**
 * Type for data loader class with static properties
 */
type DataLoaderClass = (new (config: DataLoaderConfig) => DataLoader) & {
  exampleConfig?: Record<string, any>;
  isHidden?: boolean;
};

/**
 * Map of loader class names to their constructor classes
 */
const loaderClassMap = new Map<string, DataLoaderClass>(
  DATA_LOADER_REGISTRY.map(LoaderClass => [LoaderClass.name, LoaderClass])
);

/**
 * Gets the list of available data loader class names
 */
export function getAvailableDataLoaders(): string[] {
  return Array.from(loaderClassMap.keys());
}

/**
 * Gets information about all available data loaders including their example configs
 */
export function getAvailableDataLoaderInfos(): DataLoaderInfo[] {
  return Array.from(loaderClassMap.entries()).map(([name, LoaderClass]) => ({
    name,
    exampleConfig: LoaderClass.exampleConfig || {},
    isHidden: LoaderClass.isHidden ?? false
  }));
}

/**
 * Creates a data loader instance based on the loader class name and configuration
 * @param params - Loader creation parameters
 * @returns DataLoader instance
 */
export function createDataLoader(params: {
  loaderClassName: string;
  loaderConfig: DataLoaderConfig;
}): DataLoader {
  const { loaderClassName, loaderConfig } = params;

  const LoaderClass = loaderClassMap.get(loaderClassName);
  
  if (!LoaderClass) {
    const availableLoaders = Array.from(loaderClassMap.keys()).join(", ");
    throw new Error(`Unknown data loader class name: ${loaderClassName}. Available loaders: ${availableLoaders}`);
  }

  return new LoaderClass(loaderConfig);
}

// Re-export base types and interfaces from loader.ts
export * from "@/lib/data/loader";

// Re-export loader classes for convenience
export { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";
export { SQLDataLoader } from "@/lib/data/loader/sql-data-loader";

