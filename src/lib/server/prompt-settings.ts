import { systemsPrompt } from '../../openai/prompts';
import { getDatabase } from './database';
import { hashText, logWorkflow } from './workflow-log';

const systemPromptKey = 'system_prompt';

type SettingRow = {
  value: string;
};

export const getSystemPrompt = () => {
  const row = getDatabase()
    .prepare<[string], SettingRow>('SELECT value FROM app_settings WHERE key = ?')
    .get(systemPromptKey);

  if (row) {
    logWorkflow({
      level: 'debug',
      message: 'settings.prompt.loaded',
      details: {
        length: row.value.length,
        hash: hashText(row.value),
        source: 'database'
      }
    });

    return row.value;
  }

  setSystemPrompt(systemsPrompt);

  return systemsPrompt;
};

export const setSystemPrompt = (value: string) => {
  const existing = getDatabase()
    .prepare<[string], SettingRow>('SELECT value FROM app_settings WHERE key = ?')
    .get(systemPromptKey);

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

  logWorkflow({
    level: 'info',
    message: 'settings.prompt.updated',
    details: {
      previousLength: existing?.value.length ?? null,
      previousHash: existing ? hashText(existing.value) : null,
      newLength: value.length,
      newHash: hashText(value)
    }
  });

  return value;
};

export const resetSystemPrompt = () => {
  const prompt = setSystemPrompt(systemsPrompt);

  logWorkflow({
    level: 'info',
    message: 'settings.prompt.reset',
    details: {
      length: prompt.length,
      hash: hashText(prompt)
    }
  });

  return prompt;
};
