import { DataLoader, DataLoaderConfig } from "@/lib/data/loader";
import { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";
import { SQLDataLoader } from "@/lib/data/loader/sql-data-loader";
import { DataLoaderInfo } from "@/lib/types";

/**
 * Type for data loader class with static properties
 */
type DataLoaderClass = (new (config: DataLoaderConfig) => DataLoader) & {
  exampleConfig?: Record<string, any>;
  isHidden?: boolean;
};

/**
 * Map of loader class names to their constructor classes
 * Names are stored explicitly to avoid class name mangling during build
 */
const LOADER_CLASS_MAP = new Map<string, DataLoaderClass>([
  ["GoogleAPIDataLoader", GoogleAPIDataLoader],
  ["SQLDataLoader", SQLDataLoader]
]);

/**
 * Gets the list of available data loader class names
 */
export function getAvailableDataLoaders(): string[] {
  return Array.from(LOADER_CLASS_MAP.keys());
}

/**
 * Gets information about all available data loaders including their example configs
 */
export function getAvailableDataLoaderInfos(): DataLoaderInfo[] {
  return Array.from(LOADER_CLASS_MAP.entries()).map(([name, LoaderClass]) => ({
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

  const LoaderClass = LOADER_CLASS_MAP.get(loaderClassName);
  
  if (!LoaderClass) {
    const availableLoaders = Array.from(LOADER_CLASS_MAP.keys()).join(", ");
    throw new Error(`Unknown data loader class name: ${loaderClassName}. Available loaders: ${availableLoaders}`);
  }

  return new LoaderClass(loaderConfig);
}

// Re-export base types and interfaces from loader.ts
export * from "@/lib/data/loader";

// Re-export loader classes for convenience
export { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";
export { SQLDataLoader } from "@/lib/data/loader/sql-data-loader";

