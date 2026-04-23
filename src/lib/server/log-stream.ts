import { getDatabase } from '$lib/server/database';
import { logEvents } from './db/schema';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent = {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: string;
  details?: unknown;
};

type LogSubscriber = (event: LogEvent) => void;

const subscribers = new Set<LogSubscriber>();

const insertLogEvent = () => getDatabase().insert(logEvents);

export const publishLog = (event: Omit<LogEvent, 'id' | 'timestamp'>) => {
  const timestamp = new Date().toISOString();
  const details = event.details === undefined ? null : JSON.stringify(event.details);
  const result = insertLogEvent()
    .values({
      level: event.level,
      message: event.message,
      details,
      createdAt: timestamp
    })
    .run();

  const logEvent: LogEvent = {
    ...event,
    id: Number(result.lastInsertRowid),
    timestamp
  };

  for (const subscriber of subscribers) {
    subscriber(logEvent);
  }

  return logEvent;
};

export const subscribeToLogs = (subscriber: LogSubscriber) => {
  subscribers.add(subscriber);

  return () => {
    subscribers.delete(subscriber);
  };
};
