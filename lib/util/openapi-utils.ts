import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import { z } from "zod/v3";

import logger from "@/lib/logger";
import type { DataLoaderResourceInfo } from "@/lib/types";

/**
 * Merges properties from all schemas in an allOf array
 */
export function mergeAllOfSchemas(schema: OpenAPIV3.SchemaObject): OpenAPIV3.SchemaObject {
  if (!schema.allOf) {
    return schema;
  }

  const mergedSchema: OpenAPIV3.SchemaObject = {
    type: "object",
    properties: {},
    required: []
  };

  // First, copy the parent schema"s description if it exists
  if (schema.description) {
    mergedSchema.description = schema.description;
  }

  for (const subSchema of schema.allOf) {
    // Skip if it"s a reference object
    if ("$ref" in subSchema) {
      continue;
    }

    const schemaObj = subSchema as OpenAPIV3.SchemaObject;
    if (schemaObj.properties) {
      Object.assign(mergedSchema.properties!, schemaObj.properties);
    }
    if (schemaObj.required) {
      mergedSchema.required = [...new Set([...(mergedSchema.required || []), ...schemaObj.required])];
    }
    // Only set description from subschema if parent doesn"t have one
    if (schemaObj.description && !mergedSchema.description) {
      mergedSchema.description = schemaObj.description;
    }
  }

  return mergedSchema;
}

/**
 * Converts OpenAPI schema to Zod schema with circular reference detection
 */
export function createZodSchema(schema: OpenAPIV3.SchemaObject, visited: WeakSet<object> = new WeakSet()): z.ZodType<any> {
  // Handle $ref references - return a placeholder type
  if ("$ref" in schema) {
    return z.any().nullable();
  }
  
  // Check for circular references using object identity
  if (visited.has(schema)) {
    // Circular reference detected - return a placeholder type
    return z.any().nullable();
  }
  
  // Add this schema to visited set
  visited.add(schema);
  
  let result: z.ZodType<any>;
  
  if (schema.type === "string") {
    if (schema.enum) {
      result = z.enum(schema.enum as [string, ...string[]]).nullable();
    } else {
      let zodType = z.string();
      if (schema.format === "date-time") zodType = zodType.datetime({ offset: true });
      if (schema.format === "date") zodType = zodType.date();
      result = zodType.nullable();
    }
  } else if (schema.type === "number") {
    result = z.number().nullable();
  } else if (schema.type === "integer") {
    result = z.number().int().nullable();
  } else if (schema.type === "boolean") {
    result = z.boolean().nullable();
  } else if (schema.type === "array") {
    if (!schema.items) {
      result = z.array(z.any()).nullable();
    } else {
      result = z.array(createZodSchema(schema.items as OpenAPIV3.SchemaObject, visited)).nullable();
    }
  } else if (schema.type === "object") {
    if (!schema.properties) {
      result = z.record(z.any()).nullable();
    } else {
      const shape: Record<string, z.ZodType<any>> = {};
      const requiredFields = schema.required || [];
      for (const [key, prop] of Object.entries(schema.properties)) {
        const zodType = createZodSchema(prop as OpenAPIV3.SchemaObject, visited);
        shape[key] = requiredFields.includes(key) ? zodType : zodType.optional();
      }
      result = z.object(shape).nullable();
    }
  } else {
    result = z.any().nullable();
  }
  
  // Remove this schema from visited set before returning
  visited.delete(schema);
  
  return result;
}

/**
 * Extracts resource information from an OpenAPI specification
 * @param openApiSpec - The OpenAPI specification (can be JSON or object)
 * @param resourceName - The name of the resource/schema to extract
 * @param options - Optional configuration
 * @returns Resource information including schema, columns, and timestamp columns
 */
export async function getResourceInfoFromOpenAPISpec(params: {
  openApiSpec: any;
  resourceName: string;
  useDereference?: boolean;
}): Promise<DataLoaderResourceInfo> {
  const { openApiSpec, resourceName, useDereference = false } = params;

  // Parse or dereference the OpenAPI spec
  let spec: OpenAPIV3.Document;
  
  if (useDereference) {
    try {
      spec = (await SwaggerParser.dereference(openApiSpec)) as OpenAPIV3.Document;
    } catch {
      logger.warn(
        "OpenAPI spec dereferencing failed due to circular references, parsing without dereferencing"
      );
      spec = (await SwaggerParser.parse(openApiSpec)) as OpenAPIV3.Document;
    }
  } else {
    spec = (await SwaggerParser.parse(openApiSpec)) as OpenAPIV3.Document;
  }

  // Find the schema for the resource in components/schemas
  const schemas = spec.components?.schemas || {};
  let schema = schemas[resourceName] as OpenAPIV3.SchemaObject | undefined;

  // If not found by exact name, try to find by title
  if (!schema) {
    for (const [schemaKey, schemaObj] of Object.entries(schemas)) {
      const schemaObject = schemaObj as OpenAPIV3.SchemaObject;
      if (schemaObject.title === resourceName) {
        logger.info(`Found schema for resource ${resourceName} by title (schema key: ${schemaKey})`);
        schema = schemaObject;
        break;
      }
    }
  }

  if (!schema) {
    logger.warn(`Schema not found for resource: ${resourceName}`);
    return {
      name: resourceName,
      schema: {
        type: "object",
        properties: {},
      },
      columns: [],
      timestampColumns: [],
    };
  }

  // Handle allOf merging
  if (schema.allOf) {
    schema = mergeAllOfSchemas(schema);
  }

  // Extract column names from schema properties
  const columns = schema.properties ? Object.keys(schema.properties) : [];

  // Identify timestamp columns based on common patterns
  const timestampColumns = columns.filter((col) => {
    const prop = schema.properties?.[col] as OpenAPIV3.SchemaObject;
    return (
      col.toLowerCase().includes("date") ||
      col.toLowerCase().includes("time") ||
      prop?.format === "date" ||
      prop?.format === "date-time"
    );
  });

  return {
    name: resourceName,
    schema,
    columns,
    timestampColumns,
  };
}
