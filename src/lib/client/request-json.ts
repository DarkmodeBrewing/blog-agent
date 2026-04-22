export const apiUrl = (path: string) => path.replace(/^\//, '');

export const requestJson = async <T>(endpoint: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(endpoint, init);
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error ?? data.message ?? `${endpoint} failed with HTTP ${response.status}`
    );
  }

  return data;
};
