import { createHash } from 'node:crypto';
import { publishLog, type LogEvent } from './log-stream';

type WorkflowLogInput = Omit<LogEvent, 'id' | 'timestamp'>;

export const hashText = (value: string) => {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
};

export const logWorkflow = (event: WorkflowLogInput) => {
  try {
    publishLog(event);
  } catch (cause) {
    console.error('Failed to write workflow log', cause);
  }
};

export const getErrorMessage = (cause: unknown) => {
  return cause instanceof Error ? cause.message : 'Unknown error';
};
