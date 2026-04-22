import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getRecentTokenUsageEvents,
  getTokenUsageDailySummary,
  getTokenUsageSessionSummary
} from '$lib/server/token-usage';

const parseDays = (value: string | null) => {
  const days = Number(value ?? 30);

  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return 30;
  }

  return days;
};

export const GET: RequestHandler = ({ url }) => {
  const days = parseDays(url.searchParams.get('days'));

  return json({
    days,
    daily: getTokenUsageDailySummary(days),
    sessions: getTokenUsageSessionSummary(days),
    recent: getRecentTokenUsageEvents(25)
  });
};
