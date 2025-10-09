import "reflect-metadata";

import _ from "lodash";
import { DataSource } from "typeorm";

import { DataSpecEntity } from "@/lib/data/entities";
import { DataSpec } from "@/lib/types";

function getProxyMethodName(queryName: string): string {
  return _.camelCase(queryName);
}

export class DataProxyServer {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  async registerDataSpec({ projectId, dataSpec }: { projectId: string; dataSpec: DataSpec }) {
    const repository = this.dataSource.getRepository(DataSpecEntity);
    let entity = await repository.findOneBy({ projectId });
    if (!entity) {
      entity = new DataSpecEntity();
      entity.projectId = projectId;
    }
    entity.queries = dataSpec.queries;
    await repository.save(entity);
    return projectId;
  }

  async unregisterDataSpec(projectId: string) {
    const repository = this.dataSource.getRepository(DataSpecEntity);
    await repository.delete({ projectId });
  }

  async getDataSpec(projectId: string): Promise<{ projectId: string, queries: any } | undefined> {
    const repository = this.dataSource.getRepository(DataSpecEntity);
    const entity = await repository.findOneBy({ projectId });
    if (!entity) return undefined;
    return {
      projectId: entity.projectId,
      queries: entity.queries,
    };
  }

  async fetchData({ projectId, queryName }: { projectId: string; queryName: string }) {
    const repository = this.dataSource.getRepository(DataSpecEntity);
    const entity = await repository.findOneBy({ projectId });
    if (!entity) throw new Error("Unknown dataSpec for project: " + projectId);
    const queryMap = entity.queries.reduce((acc: Record<string, string>, q: any) => {
      acc[q.name] = q.query;
      return acc;
    }, {});
    if (!queryMap[queryName]) throw new Error("Unknown query: " + queryName);
    return this.dataSource.query(queryMap[queryName]);
  }

  async getProxy(projectId: string): Promise<any> {
    const repository = this.dataSource.getRepository(DataSpecEntity);
    const entity = await repository.findOneBy({ projectId });
    if (!entity) throw new Error("Unknown dataSpec for project: " + projectId);
    const queryMap = entity.queries.reduce((acc: Record<string, string>, q: any) => {
      acc[q.name] = q.query;
      return acc;
    }, {});
    const proxy: any = {};
    entity.queries.forEach((q: any) => {
      const methodName = getProxyMethodName(q.name);
      proxy[methodName] = async () => {
        return this.dataSource.query(queryMap[q.name]);
      };
    });
    proxy.fetchData = async (queryName: string) => {
      if (!queryMap[queryName]) throw new Error("Unknown query: " + queryName);
      return this.dataSource.query(queryMap[queryName]);
    };
    return proxy;
  }
}
