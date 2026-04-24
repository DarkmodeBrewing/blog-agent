import { getDatabase } from '../database';
import { logEvents } from '../db/schema';

export const insertLogEventRow = (values: typeof logEvents.$inferInsert) => {
  return getDatabase().insert(logEvents).values(values).run();
};
