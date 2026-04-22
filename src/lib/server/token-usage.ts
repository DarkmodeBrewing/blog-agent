import { getDatabase } from './database';
import { logWorkflow } from './workflow-log';

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  details: Record<string, unknown>;
};

type RecordTokenUsageInput = {
  sessionId: string;
  operation: string;
  stage: string;
  model: string;
  responseId?: string | null;
  usage: unknown;
};

type TokenUsageSummaryRow = {
  date: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_count: number;
};

type TokenUsageSessionRow = {
  session_id: string;
  model: string;
  first_seen: string;
  last_seen: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_count: number;
};

type TokenUsageEventRow = {
  id: number;
  session_id: string;
  operation: string;
  stage: string;
  model: string;
  response_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  details_json: string;
  created_at: string;
};

const getNumberField = (value: Record<string, unknown>, key: string) => {
  const field = value[key];

  return typeof field === 'number' && Number.isFinite(field) ? field : 0;
};

export const normalizeTokenUsage = (usage: unknown): TokenUsage | null => {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const usageRecord = usage as Record<string, unknown>;
  const inputTokens = getNumberField(usageRecord, 'input_tokens');
  const outputTokens = getNumberField(usageRecord, 'output_tokens');
  const totalTokens = getNumberField(usageRecord, 'total_tokens') || inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    details: usageRecord
  };
};

export const recordTokenUsage = (input: RecordTokenUsageInput) => {
  const normalizedUsage = normalizeTokenUsage(input.usage);

  if (!normalizedUsage) {
    logWorkflow({
      level: 'debug',
      message: 'tokens.usage.missing',
      details: {
        sessionId: input.sessionId,
        operation: input.operation,
        stage: input.stage,
        model: input.model,
        responseId: input.responseId ?? null
      }
    });

    return null;
  }

  getDatabase()
    .prepare<{
      sessionId: string;
      operation: string;
      stage: string;
      model: string;
      responseId: string | null;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      detailsJson: string;
    }>(
      `
        INSERT INTO token_usage_events (
          session_id,
          operation,
          stage,
          model,
          response_id,
          input_tokens,
          output_tokens,
          total_tokens,
          details_json
        )
        VALUES (
          @sessionId,
          @operation,
          @stage,
          @model,
          @responseId,
          @inputTokens,
          @outputTokens,
          @totalTokens,
          @detailsJson
        )
      `
    )
    .run({
      sessionId: input.sessionId,
      operation: input.operation,
      stage: input.stage,
      model: input.model,
      responseId: input.responseId ?? null,
      inputTokens: normalizedUsage.inputTokens,
      outputTokens: normalizedUsage.outputTokens,
      totalTokens: normalizedUsage.totalTokens,
      detailsJson: JSON.stringify(normalizedUsage.details)
    });

  logWorkflow({
    level: 'info',
    message: 'tokens.usage.recorded',
    details: {
      sessionId: input.sessionId,
      operation: input.operation,
      stage: input.stage,
      model: input.model,
      responseId: input.responseId ?? null,
      inputTokens: normalizedUsage.inputTokens,
      outputTokens: normalizedUsage.outputTokens,
      totalTokens: normalizedUsage.totalTokens
    }
  });

  return normalizedUsage;
};

export const getTokenUsageDailySummary = (days = 30) => {
  return getDatabase()
    .prepare<[number], TokenUsageSummaryRow>(
      `
        SELECT
          date(created_at) AS date,
          model,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          COUNT(*) AS request_count
        FROM token_usage_events
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(created_at), model
        ORDER BY date(created_at) ASC, model ASC
      `
    )
    .all(days);
};

export const getTokenUsageSessionSummary = (days = 30) => {
  return getDatabase()
    .prepare<[number], TokenUsageSessionRow>(
      `
        SELECT
          session_id,
          model,
          MIN(created_at) AS first_seen,
          MAX(created_at) AS last_seen,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(total_tokens) AS total_tokens,
          COUNT(*) AS request_count
        FROM token_usage_events
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY session_id, model
        ORDER BY last_seen DESC
      `
    )
    .all(days);
};

export const getRecentTokenUsageEvents = (limit = 25) => {
  const rows = getDatabase()
    .prepare<[number], TokenUsageEventRow>(
      `
        SELECT *
        FROM token_usage_events
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    operation: row.operation,
    stage: row.stage,
    model: row.model,
    responseId: row.response_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    details: JSON.parse(row.details_json) as Record<string, unknown>,
    createdAt: row.created_at
  }));
};
