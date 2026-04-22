import { systemsPrompt } from '../../openai/prompts';
import { getDatabase } from './database';

const systemPromptKey = 'system_prompt';

type SettingRow = {
  value: string;
};

export const getSystemPrompt = () => {
  const row = getDatabase()
    .prepare<[string], SettingRow>('SELECT value FROM app_settings WHERE key = ?')
    .get(systemPromptKey);

  if (row) {
    return row.value;
  }

  setSystemPrompt(systemsPrompt);

  return systemsPrompt;
};

export const setSystemPrompt = (value: string) => {
  getDatabase()
    .prepare<{
      key: string;
      value: string;
    }>(
      `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (@key, @value, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `
    )
    .run({
      key: systemPromptKey,
      value
    });

  return value;
};

export const resetSystemPrompt = () => {
  return setSystemPrompt(systemsPrompt);
};
