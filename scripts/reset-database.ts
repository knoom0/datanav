#!/usr/bin/env tsx

/**
 * Reset the database by dropping and recreating the datanav schema
 * This will clear all application data but preserve user data schemas
 */

import { getUserDataSource, SCHEMA_NAME } from "@/lib/data/entities";
import logger from "@/lib/logger";

async function resetDatabase() {
  logger.info("Starting database reset...");
  
  try {
    const dataSource = await getUserDataSource();
    
    // Drop the datanav schema (this will cascade to all tables in the schema)
    logger.info(`Dropping schema ${SCHEMA_NAME}...`);
    await dataSource.query(`DROP SCHEMA IF EXISTS ${SCHEMA_NAME} CASCADE`);
    logger.info(`Schema ${SCHEMA_NAME} dropped successfully`);
    
    // Destroy the connection
    await dataSource.destroy();
    logger.info("Connection destroyed");
    
    // Recreate the schema by initializing a fresh connection
    logger.info("Reinitializing database with fresh schema...");
    const freshDataSource = await getUserDataSource();
    logger.info(`Schema ${SCHEMA_NAME} recreated successfully`);
    
    await freshDataSource.destroy();
    logger.info("Database reset complete!");
    
  } catch (error) {
    logger.error(`Database reset failed: ${error}`);
    process.exit(1);
  }
}

resetDatabase();

