export const normalizeTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
};

export const formatTimestamp = (value: string | null | undefined, fallback = '—') => {
  const normalized = normalizeTimestamp(value);

  return normalized ? new Date(normalized).toLocaleString() : fallback;
};
