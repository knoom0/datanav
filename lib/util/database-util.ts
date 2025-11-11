import { CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * Decorator for created date column that stores timestamps in UTC
 * and returns them as UTC Date objects
 */
export function CreateDateColumnUTC(): PropertyDecorator {
  return CreateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  });
}

/**
 * Decorator for updated date column that stores timestamps in UTC
 * and returns them as UTC Date objects
 */
export function UpdateDateColumnUTC(): PropertyDecorator {
  return UpdateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
  });
}

