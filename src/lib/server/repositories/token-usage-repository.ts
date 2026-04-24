import { desc, gte, sql } from 'drizzle-orm';
import { getDatabase } from '../database';
import { tokenUsageEvents } from '../db/schema';

export const insertTokenUsageEvent = (values: typeof tokenUsageEvents.$inferInsert) => {
  getDatabase().insert(tokenUsageEvents).values(values).run();
};

export const selectTokenUsageDailySummary = (days: number) => {
  const since = sql<string>`datetime('now', '-' || ${days} || ' days')`;

  return getDatabase()
    .select({
      date: sql<string>`date(${tokenUsageEvents.createdAt})`,
      model: tokenUsageEvents.model,
      input_tokens: sql<number>`sum(${tokenUsageEvents.inputTokens})`,
      output_tokens: sql<number>`sum(${tokenUsageEvents.outputTokens})`,
      total_tokens: sql<number>`sum(${tokenUsageEvents.totalTokens})`,
      request_count: sql<number>`count(*)`
    })
    .from(tokenUsageEvents)
    .where(gte(tokenUsageEvents.createdAt, since))
    .groupBy(sql`date(${tokenUsageEvents.createdAt})`, tokenUsageEvents.model)
    .orderBy(sql`date(${tokenUsageEvents.createdAt})`, tokenUsageEvents.model)
    .all();
};

export const selectTokenUsageSessionSummary = (days: number) => {
  const since = sql<string>`datetime('now', '-' || ${days} || ' days')`;

  return getDatabase()
    .select({
      session_id: tokenUsageEvents.sessionId,
      model: tokenUsageEvents.model,
      first_seen: sql<string>`min(${tokenUsageEvents.createdAt})`,
      last_seen: sql<string>`max(${tokenUsageEvents.createdAt})`,
      input_tokens: sql<number>`sum(${tokenUsageEvents.inputTokens})`,
      output_tokens: sql<number>`sum(${tokenUsageEvents.outputTokens})`,
      total_tokens: sql<number>`sum(${tokenUsageEvents.totalTokens})`,
      request_count: sql<number>`count(*)`
    })
    .from(tokenUsageEvents)
    .where(gte(tokenUsageEvents.createdAt, since))
    .groupBy(tokenUsageEvents.sessionId, tokenUsageEvents.model)
    .orderBy(desc(sql`max(${tokenUsageEvents.createdAt})`))
    .all();
};

export const selectRecentTokenUsageEvents = (limit: number) => {
  return getDatabase()
    .select()
    .from(tokenUsageEvents)
    .orderBy(desc(tokenUsageEvents.createdAt))
    .limit(limit)
    .all();
};
