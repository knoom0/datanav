import "server-only";

import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { ReportBundleEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import type { ReportBundle } from "@/lib/types";

export interface CreateReportBundleParams {
  bundle: {
    text: string;
    dataQueryResults: Array<{
      name: string;
      description: string;
      query: string;
      records: Record<string, any>[];
    }>;
  };
}

export interface GetReportBundleParams {
  id: string;
}

/**
 * ReportStore handles storage and retrieval of report bundles
 */
export class ReportStore {
  private dataSource: DataSource;

  constructor(params: { dataSource: DataSource }) {
    this.dataSource = params.dataSource;
  }

  /**
   * Creates and stores a new report bundle
   */
  async create(params: CreateReportBundleParams): Promise<string> {
    const { bundle } = params;

    logger.info("Creating report bundle");

    const reportBundle = new ReportBundleEntity();
    reportBundle.id = uuidv4();
    reportBundle.bundle = bundle;

    await this.dataSource.getRepository(ReportBundleEntity).save(reportBundle);

    logger.info(`Created report bundle ${reportBundle.id}`);

    return reportBundle.id;
  }

  /**
   * Retrieves a report bundle by ID
   */
  async get(params: GetReportBundleParams): Promise<ReportBundleEntity | null> {
    const { id } = params;

    logger.info(`Retrieving report bundle ${id}`);

    const reportBundle = await this.dataSource
      .getRepository(ReportBundleEntity)
      .findOne({ where: { id } });

    if (!reportBundle) {
      logger.info(`Report bundle ${id} not found`);
      return null;
    }

    return reportBundle;
  }

  /**
   * Deletes a report bundle by ID
   */
  async delete(params: GetReportBundleParams): Promise<boolean> {
    const { id } = params;

    logger.info(`Deleting report bundle ${id}`);

    const result = await this.dataSource
      .getRepository(ReportBundleEntity)
      .delete({ id });

    const deleted = (result.affected ?? 0) > 0;

    if (deleted) {
      logger.info(`Deleted report bundle ${id}`);
    } else {
      logger.info(`Report bundle ${id} not found for deletion`);
    }

    return deleted;
  }

  /**
   * Converts a ReportBundleEntity to a ReportBundle artifact
   */
  static toReportBundle(entity: ReportBundleEntity): ReportBundle {
    return {
      type: "report_bundle",
      text: entity.bundle.text,
      dataQueryResults: entity.bundle.dataQueryResults
    };
  }
}

