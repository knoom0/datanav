import _ from "lodash";

import { DataSpec, ColumnInfo } from "@/lib/types";

function getProxyMethodName(queryName: string): string {
  return _.camelCase(queryName);
}

function columnInfoToTSType(columnInfo: ColumnInfo): string {
  switch (columnInfo.dataType) {
  case "string":
    return "string";
  case "number":
    return "number";
  case "boolean":
    return "boolean";
  case "date":
    return "Date";
  case "json":
    return "any";
  default:
    return "any";
  }
}

function generateTypeInterface(queryName: string, columnInfos: ColumnInfo[]): string {
  const typeName = `${_.startCase(queryName).replace(/\s/g, "")}Row`;
  const properties = columnInfos.map(col => {
    const tsType = columnInfoToTSType(col);
    return `  ${col.name}: ${tsType};`;
  }).join("\n");
  
  return `interface ${typeName} {\n${properties}\n}`;
}

export function generateDataProxyInterface(dataSpec: DataSpec): string {
  const typeInterfaces: string[] = [];
  const methods = dataSpec.queries.map(q => {
    const methodName = getProxyMethodName(q.name);
    
    if (q.columnInfos && q.columnInfos.length > 0) {
      const typeName = `${_.startCase(q.name).replace(/\s/g, "")}Row`;
      typeInterfaces.push(generateTypeInterface(q.name, q.columnInfos));
      return `\n  /**\n   * ${q.description}\n   */\n  ${methodName}(): Promise<${typeName}[]>;`;
    } else {
      return `\n  /**\n   * ${q.description}\n   */\n  ${methodName}(): Promise<any[]>;`;
    }
  }).join("");

  const typeDeclarations = typeInterfaces.length > 0 
    ? `${typeInterfaces.join("\n\n")}\n\n` 
    : "";

  return `// DataProxy interface generated from DataSpec\n${typeDeclarations}export interface DataProxy {${methods}\n}`;
}

export function createDataProxyClient(projectId: string, dataSpec: DataSpec): any {
  const proxy: any = {};
  async function callApi(queryName: string) {
    const res = await fetch(`/api/data-proxy/${projectId}/${queryName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }
  dataSpec.queries.forEach(q => {
    const methodName = getProxyMethodName(q.name);
    proxy[methodName] = async () => callApi(q.name);
  });
  return proxy;
}

/**
 * Creates a mock data proxy from a DataSpec"s sampleData
 */
export function createMockDataProxy(dataSpec: DataSpec) {
  const mockData: Record<string, any[]> = {};
  if (dataSpec && Array.isArray(dataSpec.queries)) {
    dataSpec.queries.forEach((query: any) => {
      const methodName = getProxyMethodName(query.name);
      mockData[methodName] = query.sampleData || [];
    });
  }
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === "string" && prop in mockData) {
        return async () => mockData[prop];
      }
      return async () => [];
    },
  });
}
