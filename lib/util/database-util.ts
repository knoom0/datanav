import { CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * Decorator for created date column that stores timestamps in UTC
 * and returns them as UTC Date objects
 * 
 * Note: Does not specify a type to allow TypeORM to automatically choose
 * the appropriate type for each database (timestamptz for PostgreSQL, datetime for SQLite).
 */
export function CreateDateColumnUTC(): PropertyDecorator {
  return CreateDateColumn();
}

/**
 * Decorator for updated date column that stores timestamps in UTC
 * and returns them as UTC Date objects
 * 
 * Note: Does not specify a type to allow TypeORM to automatically choose
 * the appropriate type for each database (timestamptz for PostgreSQL, datetime for SQLite).
 */
export function UpdateDateColumnUTC(): PropertyDecorator {
  return UpdateDateColumn();
}

