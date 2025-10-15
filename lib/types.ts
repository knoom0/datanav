import { UIMessage } from "ai";

/**
 * UI Bundle part type constant for message parts
 */
export const UI_BUNDLE_PART_TYPE = "data-ui-bundle" as const;

/**
 * Project part type constant for message parts
 */
export const PROJECT_PART_TYPE = "data-project" as const;

/**
 * Report bundle part type constant for message parts
 */
export const REPORT_BUNDLE_PART_TYPE = "data-report-bundle" as const;

/**
 * Report page break constant for splitting reports into pages
 */
export const REPORT_PAGE_BREAK = "\\newpage" as const;

/**
 * Message metadata type for tracking generation information
 */
export interface MessageMetadata {
  /** Timestamp when message generation started */
  startedAt?: number;
  /** Timestamp when message generation finished */
  finishedAt?: number;
  /** Duration of message generation in milliseconds */
  generationTimeMs?: number;
}

/**
 * Typed UIMessage with metadata
 */
export type TypedUIMessage = UIMessage<MessageMetadata>;

// ActionableError is a base class for errors that can be handled by the agent
export class ActionableError extends Error {}

export type ProductType = "dashboard" | "report";

export interface ProjectConfig {
  screenSize: {
    width: number;
    height: number;
  };
  deviceType: "mobile" | "tablet" | "desktop";
  designRefImage: ArrayBuffer;
}

export type ComponentInfo = {
  name: string;
  description: string;
  documentation: string;
  packageName: string;
  packageVersion: string;
  keywords?: string[];
}

export interface TableInfo {
  schema?: string;
  name: string;
  ddl: string;
}

export interface DataSource {
  /** Unique identifier for the data source (e.g. "google.calendar", "plaid.transactions") */
  id: string;
  /** Human-readable name of the data source */
  name: string;
  /** Description of what data this source provides */
  description: string;
  /** Function to establish connection and load data from this source */
  connector: (accessToken?: string, options?: Record<string, any>) => Promise<any>;
}

/**
 * Information about a data connector including its configuration and current status
 */
export interface DataConnectorInfo {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  isLoading: boolean;
  lastLoadedAt: Date | null;
  dataJobId: string | null;
}

/**
 * Job information that mirrors the DataJobEntity structure for UI display
 */
export interface DataJobInfo {
  id: string;
  dataConnectorId: string;
  type: string;
  state: "created" | "running" | "finished";
  result: "success" | "error" | "canceled" | null;
  runTimeMs: number;
  params: Record<string, any> | null;
  syncContext: Record<string, any> | null;
  progress: {
    updatedRecordCount: number;
    [key: string]: any;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Column information that describes the schema of a data column
 */
export interface ColumnInfo {
  /** The name of the column */
  name: string;
  /** The data type of the column */
  dataType: "string" | "number" | "boolean" | "date" | "json";
  /** Optional description or comment for the column */
  description?: string;
}

/**
 * Base class for all artifacts with proper type discrimination
 */
export interface BaseArtifact {
  type: string;
}

export interface PRD extends BaseArtifact {
  type: "prd";
  text: string;
}

export type DesignImage = {
  imageBase64: string;
  description: string;
};

export interface Design extends BaseArtifact {
  type: "design";
  images: DesignImage[];
}

export type DataQuery = {
  name: string;
  description: string;
  query: string;
  columnInfos?: ColumnInfo[];
  sampleData?: Record<string, any>[];
};

export type DataQueryResult = {
  name: string;
  description: string;
  query: string;
  columnInfos?: ColumnInfo[];
  records: Record<string, any>[];
};

export type DataChartConfig = {
  type: "area" | "bar" | "donut" | "line" | "pie" | "radar" | "scatter" | "sparkline";
  dataQueryName: string;
  keyColumnName: string;
  seriesColumnNames: string[];
};

export interface DataSpec extends BaseArtifact {
  type: "data_spec";
  queries: DataQuery[];
}

export interface Code extends BaseArtifact {
  type: "code";
  sourceCode: string;
}

export interface Report extends BaseArtifact {
  type: "report";
  text: string;
}

export interface ReportBundle extends BaseArtifact {
  type: "report_bundle";
  text: string;
  dataQueryResults: DataQueryResult[];
}

export interface UIBundle extends BaseArtifact {
  type: "ui_bundle";
  uuid: string;
  sourceCode: string;
  compiledCode: string;
  sourceMap: object;
  dataSpec: DataSpec;
}

export type Artifact =
  | PRD
  | Design
  | DataSpec
  | Code
  | Report
  | ReportBundle
  | UIBundle;

/**
 * Project represents a collection of artifacts and context for EvoAgents to work with.
 * It manages the lifecycle and organization of artifacts produced during the generation process.
 */
export class Project {
  readonly id: string;
  prompt: string;
  readonly createdAt: Date;
  updatedAt: Date;
  private artifacts: Map<string, Artifact>;

  constructor(prompt: string, id?: string) {
    this.id = id ?? generateId();
    this.prompt = prompt;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.artifacts = new Map();
  }

  /**
   * Put (add or update) an artifact in the project by its type
   */
  put(artifact: Artifact): void {
    this.artifacts.set(artifact.type, artifact);
    this.updatedAt = new Date();
  }

  /**
   * Get an artifact by its type
   */
  get(type: string): Artifact | undefined {
    return this.artifacts.get(type);
  }

  /**
   * Get all artifacts of a specific type
   */
  getArtifactsByType<T extends Artifact>(type: T["type"]): T[] {
    return Array.from(this.artifacts.values())
      .filter((artifact): artifact is T => artifact.type === type);
  }

  /**
   * Get all artifacts in the project
   */
  getAllArtifacts(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  /**
   * Get the first DataSpec artifact, or a default if not present
   */
  getDataSpec(): DataSpec {
    const dataSpec = this.getArtifactsByType<DataSpec>("data_spec")[0];
    return dataSpec ?? { type: "data_spec" as const, queries: [] };
  }

  /**
   * Get the first UIBundle artifact, or null if not present
   */
  getUIBundle(): UIBundle | null {
    const uiBundle = this.getArtifactsByType<UIBundle>("ui_bundle")[0];
    return uiBundle ?? null;
  }

  /**
   * Serialize the project to a JSON-compatible object
   */
  toJSON(): any {
    return {
      id: this.id,
      prompt: this.prompt,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      artifacts: this.getAllArtifacts()
    };
  }

  /**
   * Create a Project instance from serialized JSON data
   */
  static fromJSON(data: any): Project {
    const project = new Project(data.prompt, data.id);
    (project as any).createdAt = new Date(data.createdAt);
    project.updatedAt = new Date(data.updatedAt);
    
    // Restore artifacts if present
    if (data.artifacts && Array.isArray(data.artifacts)) {
      for (const artifact of data.artifacts) {
        project.put(artifact);
      }
    }
    
    return project;
  }
}

/**
 * Compare two UISpec objects for shallow equality
 */
export function areSpecsEqual(a: UIBundle, b: UIBundle): boolean {
  return (
    a.sourceCode === b.sourceCode &&
    a.compiledCode === b.compiledCode &&
    JSON.stringify(a.sourceMap) === JSON.stringify(b.sourceMap) &&
    JSON.stringify(a.dataSpec) === JSON.stringify(b.dataSpec)
  );
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now();
}
