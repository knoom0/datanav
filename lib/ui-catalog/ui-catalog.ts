import { DataSource } from "typeorm";
import { z } from "zod/v3";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { ComponentInfoEntity } from "@/lib/data/entities";
import { ComponentInfo } from "@/lib/types";

/**
 * Convert TypeORM entity to plain ComponentInfo object
 */
function entityToPlainObject(entity: ComponentInfoEntity): ComponentInfo & { createdAt: Date; updatedAt: Date } {
  return {
    name: entity.name,
    description: entity.description,
    documentation: entity.documentation,
    packageName: entity.packageName,
    packageVersion: entity.packageVersion,
    keywords: entity.keywords,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}

function applySearchQuery(
  queryBuilder: any,
  {
    query,
    includeRanking,
    packageName,
    packageVersion,
    offset,
    limit,
  }: {
    query?: string;
    includeRanking: boolean;
    packageName?: string;
    packageVersion?: string;
    offset?: number;
    limit?: number;
  }
) {
  if (packageName) {
    queryBuilder.andWhere("component.packageName = :packageName", { packageName });
  }

  if (packageVersion) {
    queryBuilder.andWhere("component.packageVersion = :packageVersion", { packageVersion });
  }

  const trimmed = (query || "").trim();
  if (trimmed.length === 0) {
    // Default ordering when no query is provided
    queryBuilder.orderBy("component.name", "ASC");
  } else {
    // Escape single quotes in the search query to prevent SQL injection
    // For PostgreSQL, single quotes need to be doubled
    const escapedQuery = trimmed.replace(/'/g, "''");

    // Create full-text search vectors for component fields
    // Combine name (A) and description (B)
    const searchVector = `
        setweight(to_tsvector('english', coalesce(component.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(component.description, '')), 'B')
        `;

    // Convert the query into ORed search query for tsquery
    const orQuery = escapedQuery.split(" ").join("|");
    const tsquery = `to_tsquery('english', '${orQuery}')`;

    if (includeRanking) {
      // Add relevance ranking using ts_rank with normalization
      // setweight above biases fields (name > description)
      queryBuilder.addSelect(
        `ts_rank(${searchVector}, ${tsquery}, 32)`,
        "relevance_score"
      );
    }

    // Filter results to only include matches
    queryBuilder.andWhere(`${searchVector} @@ ${tsquery}`);

    if (includeRanking) {
      // Order by relevance score (highest first)
      queryBuilder.orderBy("relevance_score", "DESC");
    }
  }

  if (typeof offset === "number" && offset > 0) {
    queryBuilder.offset(offset);
  }
  if (typeof limit === "number" && limit > 0) {
    queryBuilder.limit(limit);
  }
}

/**
 * Save a component info to the database (upserts if component with same name and packageName exists)
 */
export async function saveComponentInfo(componentInfo: ComponentInfo, dataSource: DataSource): Promise<ComponentInfoEntity> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  
  // Check if component already exists with same name and package
  const existingEntity = await componentInfoRepo.findOne({
    where: { 
      name: componentInfo.name,
      packageName: componentInfo.packageName 
    }
  });
  
  let entity: ComponentInfoEntity;
  
  if (existingEntity) {
    // Update existing entity
    entity = existingEntity;
    entity.description = componentInfo.description;
    entity.documentation = componentInfo.documentation;
    entity.packageVersion = componentInfo.packageVersion;
    entity.keywords = componentInfo.keywords || [];
    entity.updatedAt = new Date();
  } else {
    // Create new entity
    entity = new ComponentInfoEntity();
    entity.name = componentInfo.name;
    entity.description = componentInfo.description;
    entity.documentation = componentInfo.documentation;
    entity.packageName = componentInfo.packageName;
    entity.packageVersion = componentInfo.packageVersion;
    entity.keywords = componentInfo.keywords || [];
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
  }
  
  return await componentInfoRepo.save(entity);
}

/**
 * Get all component info from the database
 */
export async function getAllComponentInfo({
  offset = 0,
  limit,
  dataSource
}: {
  offset?: number;
  limit?: number;
  dataSource: DataSource;
}): Promise<(ComponentInfo & { createdAt: Date; updatedAt: Date })[]> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  const entities = await componentInfoRepo.find({
    order: { name: "ASC" },
    skip: offset,
    take: limit
  });
  return entities.map(entityToPlainObject);
}

/**
 * Get component info by name
 */
export async function getComponentInfoByName(name: string, dataSource: DataSource): Promise<(ComponentInfo & { createdAt: Date; updatedAt: Date }) | null> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  const entity = await componentInfoRepo.findOne({
    where: { name }
  });
  return entity ? entityToPlainObject(entity) : null;
}

/**
 * Search component info by various criteria with full-text search and relevance scoring
 */
export async function searchComponentInfo({
  packageName,
  packageVersion,
  query,
  offset = 0,
  limit,
  dataSource
}: {
  packageName?: string;
  packageVersion?: string;
  query?: string;
  offset?: number;
  limit?: number;
  dataSource: DataSource;
}): Promise<(ComponentInfo & { createdAt: Date; updatedAt: Date })[]> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  const queryBuilder = componentInfoRepo.createQueryBuilder("component");

  applySearchQuery(queryBuilder, {
    query,
    includeRanking: true,
    packageName,
    packageVersion,
    offset,
    limit,
  });

  const entities = await queryBuilder.getMany();
  return entities.map(entityToPlainObject);
}

/**
 * Get total count of components
 */
export async function getComponentCount(dataSource: DataSource): Promise<number> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  return await componentInfoRepo.count();
}

/**
 * Get count of components matching search criteria using full-text search
 */
export async function getSearchComponentCount({
  packageName,
  packageVersion,
  query,
  dataSource
}: {
  packageName?: string;
  packageVersion?: string;
  query?: string;
  dataSource: DataSource;
}): Promise<number> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  const queryBuilder = componentInfoRepo.createQueryBuilder("component");

  applySearchQuery(queryBuilder, {
    query,
    includeRanking: false,
    packageName,
    packageVersion,
  });

  return await queryBuilder.getCount();
}

/**
 * Get all unique package names from stored components
 */
export async function getPackageNames(dataSource: DataSource): Promise<string[]> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  
  const result = await componentInfoRepo.createQueryBuilder("component")
    .select("DISTINCT component.packageName", "packageName")
    .orderBy("component.packageName", "ASC")
    .getRawMany();
    
  return result.map(row => row.packageName);
}

/**
 * Get all unique keywords from stored components
 */
export async function getAllKeywords(dataSource: DataSource): Promise<string[]> {
  const componentInfoRepo = dataSource.getRepository(ComponentInfoEntity);
  
  const components = await componentInfoRepo.find({
    select: ["keywords"]
  });
  
  const allKeywords = new Set<string>();
  components.forEach(component => {
    component.keywords.forEach(keyword => allKeywords.add(keyword));
  });
  
  return Array.from(allKeywords).sort();
}

/**
 * Tool for storing component info knowledge to the databaseC
 */
export class ComponentInfoSaveTool extends BaseAgentTool {
  readonly name = "StoreComponentInfo";
  readonly description = "Store component info knowledge and research data to the component database";
  
  readonly inputSchema = z.object({
    name: z.string().describe("Component name (e.g., 'Button', 'TextField')"),
    description: z.string().describe("Brief description of what the component does"),
    documentation: z.string().describe("Markdown-style documentation with sections including usage, options and examples"),
    packageName: z.string().describe("Package name (e.g., '@mantine/core', 'react-router-dom')"),
    packageVersion: z.string().describe("Package version (e.g., '1.2.3'). MUST NOT be a placeholder version ('latest' or 'next')"),
    keywords: z.array(z.string()).describe("Keywords for searching this component (e.g., ['form', 'input', 'validation'])")
  });

  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    super();
    this.dataSource = dataSource;
  }

  protected async executeInternal({ name, description, documentation, packageName, packageVersion, keywords }: {
    name: string;
    description: string;
    documentation: string;
    packageName: string;
    packageVersion: string;
    keywords: string[];
  }) {
    const componentInfo: ComponentInfo = {
      name,
      description,
      documentation,
      packageName,
      packageVersion,
      keywords,
    };

    // Store the component info in the database
    const storedData = await saveComponentInfo(componentInfo, this.dataSource);
    
    return {
      success: true,
      message: `Component info '${name}' successfully stored in database`,
      storedData: {
        name: storedData.name,
        description: storedData.description,
        documentation: storedData.documentation,
        packageName: storedData.packageName,
        packageVersion: storedData.packageVersion,
        keywords: storedData.keywords,
        createdAt: storedData.createdAt,
        updatedAt: storedData.updatedAt
      }
    };
  }
}

/**
 * Tool for looking up component info from the database
 */
export class UICatalogTool extends BaseAgentTool {
  readonly name = "LookupComponentInfo";
  readonly description = "Search and retrieve component info from the component database. Supports two operations: search (find components by query) and read_doc (get documentation for a specific component)";
  
  readonly inputSchema = z.object({
    operation: z.enum(["search", "read_doc"]).describe("Operation to perform: 'search' to find components, 'read_doc' to get component documentation"),
    query: z.string().optional().describe("Search query string to find components (required for search operation). e.g. 'button input'"),
    componentName: z.string().optional().describe("Name of the component to read documentation for (required for read_doc operation)")
  });

  private packages: string[];
  private dataSource: DataSource;
  private static readonly TOP_RESULTS_LIMIT = 10;

  constructor(packages: string[], dataSource: DataSource) {
    super();
    this.packages = packages;
    this.dataSource = dataSource;
  }

  protected async executeInternal({ operation, query, componentName }: { 
    operation: "search" | "read_doc"; 
    query?: string; 
    componentName?: string; 
  }) {
    if (operation === "search") {
      return await this.handleSearchOperation(query);
    } else if (operation === "read_doc") {
      return await this.handleReadDocOperation(componentName);
    } else {
      return {
        success: false,
        error: `Unknown operation: ${operation}`
      };
    }
  }

  private async handleSearchOperation(query?: string) {
    if (!query) {
      return {
        success: false,
        error: "Query parameter is required for search operation"
      };
    }

    // Search for components matching the query
    const allComponents = [];
    
    // Search across all specified packages
    for (const pkg of this.packages) {
      const components = await searchComponentInfo({
        query: query,
        packageName: pkg,
        dataSource: this.dataSource
      });
      allComponents.push(...components);
    }
    
    // Remove duplicates based on component name and package
    const uniqueComponents = allComponents.filter((component, index, array) => 
      array.findIndex(c => c.name === component.name && c.packageName === component.packageName) === index
    );
    
    // Sort by package name, then by component name
    uniqueComponents.sort((a, b) => {
      if (a.packageName !== b.packageName) {
        return a.packageName.localeCompare(b.packageName);
      }
      return a.name.localeCompare(b.name);
    });
    
    const totalFound = uniqueComponents.length;
    const topComponents = uniqueComponents.slice(0, UICatalogTool.TOP_RESULTS_LIMIT);
    const packageLabel = `packages: ${this.packages.join(", ")}`;
    
    // Return only name and description for search results
    const searchResults = topComponents.map(component => ({
      name: component.name,
      description: component.description,
      packageName: component.packageName
    }));
    
    let message: string;
    if (totalFound === 0) {
      message = `Found 0 components matching "${query}" across ${packageLabel}`;
    } else if (totalFound <= UICatalogTool.TOP_RESULTS_LIMIT) {
      message = `Found ${totalFound} component(s) matching "${query}" across ${packageLabel}`;
    } else {
      message = `Found ${totalFound} components matching "${query}" across ${packageLabel}. Showing top ${UICatalogTool.TOP_RESULTS_LIMIT} results.`;
    }
    
    return {
      success: true,
      operation: "search",
      message,
      components: searchResults
    };
  }

  private async handleReadDocOperation(componentName?: string) {
    if (!componentName) {
      return {
        success: false,
        error: "componentName parameter is required for read_doc operation"
      };
    }

    // Search for the component across all specified packages
    let foundComponent = null;
    
    for (const pkg of this.packages) {
      const components = await searchComponentInfo({
        query: componentName,
        packageName: pkg,
        dataSource: this.dataSource
      });
      
      // Look for exact name match
      const exactMatch = components.find(c => c.name === componentName);
      if (exactMatch) {
        foundComponent = exactMatch;
        break;
      }
    }
    
    if (!foundComponent) {
      const packageLabel = `packages: ${this.packages.join(", ")}`;
      return {
        success: false,
        error: `Component "${componentName}" not found in ${packageLabel}`
      };
    }
    
    return {
      success: true,
      operation: "read_doc",
      message: `Retrieved documentation for component "${componentName}" from package "${foundComponent.packageName}"`,
      component: {
        name: foundComponent.name,
        packageName: foundComponent.packageName,
        documentation: foundComponent.documentation
      }
    };
  }
} 