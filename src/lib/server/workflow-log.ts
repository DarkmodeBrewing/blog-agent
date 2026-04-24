import { createHash } from 'node:crypto';
import { publishLog, type LogEvent } from './log-stream';

type WorkflowLogLevel = LogEvent['level'];

type WorkflowLogContext = {
  actionId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  jobId?: string | null;
  bundleId?: number | null;
  slug?: string | null;
  target?: string | null;
  model?: string | null;
};

type WorkflowLogInput = {
  level: WorkflowLogLevel;
  message: string;
  details?: Record<string, unknown>;
  context?: WorkflowLogContext;
};

export const hashText = (value: string) => {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
};

const redactKeyPattern = /(key|token|secret|password|authorization)/i;

const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, fieldValue] of Object.entries(record)) {
    if (redactKeyPattern.test(key)) {
      sanitized[key] =
        typeof fieldValue === 'string' && fieldValue.trim().length > 0 ? '[redacted]' : null;
      continue;
    }

    sanitized[key] = sanitizeValue(fieldValue);
  }

  return sanitized;
};

export const createRequestId = () => {
  return `req_${hashText(`${Date.now()}_${Math.random()}`)}`;
};

export const logWorkflow = (event: WorkflowLogInput) => {
  try {
    publishLog({
      level: event.level,
      message: event.message,
      details: sanitizeValue({
        context: event.context ?? {},
        details: event.details ?? {}
      }) as LogEvent['details']
    });
  } catch (cause) {
    console.error('Failed to write workflow log', cause);
  }
};

export const getErrorMessage = (cause: unknown) => {
  return cause instanceof Error ? cause.message : 'Unknown error';
};
