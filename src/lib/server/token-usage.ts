import { logWorkflow } from './workflow-log';
import {
  insertTokenUsageEvent,
  selectRecentTokenUsageEvents,
  selectTokenUsageDailySummary,
  selectTokenUsageSessionSummary
} from './repositories/token-usage-repository';

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

  insertTokenUsageEvent({
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
  return selectTokenUsageDailySummary(days) satisfies TokenUsageSummaryRow[];
};

export const getTokenUsageSessionSummary = (days = 30) => {
  return selectTokenUsageSessionSummary(days) satisfies TokenUsageSessionRow[];
};

export const getRecentTokenUsageEvents = (limit = 25) => {
  const rows = selectRecentTokenUsageEvents(limit);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    operation: row.operation,
    stage: row.stage,
    model: row.model,
    responseId: row.responseId,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    details: JSON.parse(row.detailsJson) as Record<string, unknown>,
    createdAt: row.createdAt
  }));
};
