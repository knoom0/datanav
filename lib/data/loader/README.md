# Data Loaders

Data loaders are responsible for fetching data from external sources and providing schema information. This directory contains implementations of the `DataLoader` interface for different data sources.

## Available Loaders

### GoogleAPIDataLoader

Loads data from Google APIs (Gmail, Calendar, YouTube, etc.) using OAuth2 authentication.

**Location:** `google-api-data-loader.ts`

**Features:**
- OAuth2 authentication flow
- Token management (access & refresh tokens)
- Configurable scopes
- Custom fetch implementation per API

**Example:**
```typescript
import { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";

const loader = new GoogleAPIDataLoader({
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  onFetch: async function* ({ auth, syncContext }) {
    // Fetch logic here
    yield { resourceName: "Message", ...data };
    return { hasMore: false };
  }
});
```

### SQLDataLoader

Loads data from SQL databases (PostgreSQL) and automatically generates schemas from table DDL.

**Location:** `sql-data-loader.ts`

**Features:**
- Direct SQL database connection
- Automatic schema generation from table DDL
- Auto-discovery of all tables in the database
- Automatic detection of timestamp columns for incremental sync
- PostgreSQL data type to OpenAPI type mapping

**Constructor Parameters:**
- `host`: Database host (e.g., "localhost")
- `port`: Database port (default: 5432)
- `username`: Database username
- `password`: Database password
- `database`: Database name
- `schema`: Database schema (default: "public")

**Incremental Sync:**
The loader automatically detects common timestamp columns (`updated_at`, `modified_at`, `created_at`, `inserted_at`) for incremental sync. When `lastSyncedAt` is provided, it will use the detected timestamp column to fetch only updated records.

**Example:**
```typescript
import { SQLDataLoader } from "@/lib/data/loader/sql-data-loader";

const loader = new SQLDataLoader({
  host: "localhost",
  port: 5432,
  username: "myuser",
  password: "mypassword",
  database: "mydb",
  schema: "public"
});

// Get schema for a table
const schema = await loader.getResourceSchema("users");

// Fetch data from specified tables
const generator = loader.fetch({
  resources: [
    { name: "users", updatedAtColumn: "updated_at" },
    { name: "orders", createdAtColumn: "created_at" }
  ],
  syncContext: {},
  lastSyncedAt: new Date("2024-01-01"),
  maxDurationToRunMs: 60000
});

for await (const record of generator) {
  console.log(record);
}

// Always close when done
await loader.close();
```

## DataLoader Interface

All data loaders must implement the `DataLoader` interface:

```typescript
interface DataLoader {
  // Authentication
  authenticate(params: { redirectTo: string }): { authUrl: string };
  continueToAuthenticate(params: { code: string; redirectTo: string }): Promise<void>;
  
  // Token management
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  getRefreshToken?(): string | null;
  setRefreshToken?(token: string): void;
  
  // Schema retrieval (optional)
  getSchema?(resourceName: string): Promise<OpenAPIV3.SchemaObject>;
  
  // Data fetching
  fetch(params: { 
    lastSyncedAt?: Date; 
    syncContext: Record<string, any> | null;
    maxDurationToRunMs?: number;
  }): AsyncGenerator<DataRecord, { hasMore: boolean }, unknown>;
}
```

## Creating a Custom Loader

To create a custom data loader:

1. Create a new file in this directory
2. Implement the `DataLoader` interface
3. Add tests following the pattern in `sql-data-loader.test.ts`
4. Export your loader from `index.ts`

### Example Structure

```typescript
import type { DataRecord } from "@/lib/data/entities";
import { DataLoader } from "@/lib/data/loader";

export class MyCustomLoader implements DataLoader {
  authenticate(params: { redirectTo: string }) {
    // Implement authentication
  }
  
  async continueToAuthenticate(params: { code: string; redirectTo: string }) {
    // Complete authentication
  }
  
  getAccessToken() {
    return this.accessToken;
  }
  
  setAccessToken(token: string) {
    this.accessToken = token;
  }
  
  async getSchema(resourceName: string) {
    // Return OpenAPI schema for the resource
  }
  
  async *fetch(params) {
    // Yield records
    yield { resourceName: "MyResource", ...data };
    return { hasMore: false };
  }
}
```

## Schema Generation

Loaders can optionally implement the `getSchema` method to provide runtime schema information:

- **GoogleAPIDataLoader**: Schemas are typically provided via `openApiSpec` in the connector config
- **SQLDataLoader**: Automatically generates schemas by querying `information_schema.columns`

The schema generation is integrated with `DataConnector.create()` which will:
1. First try to load schemas from `openApiSpec` if provided
2. Fall back to calling `loader.getResourceSchema()` if the loader supports it
3. Warn if neither method provides schemas

## Testing

All loaders should have comprehensive tests covering:
- Authentication flow (if applicable)
- Schema generation
- Data fetching
- Incremental sync
- Error handling

See `sql-data-loader.test.ts` for a complete example.

