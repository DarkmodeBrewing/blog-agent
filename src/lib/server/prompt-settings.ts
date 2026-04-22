import { systemsPrompt } from '../../openai/prompts';
import { getDatabase } from './database';
import { hashText, logWorkflow } from './workflow-log';

const systemPromptKey = 'system_prompt';
const modelListKey = 'openai_model_list';
const selectedModelKey = 'openai_selected_model';
const defaultModels = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'];

type SettingRow = {
  value: string;
};

const getSetting = (key: string) => {
  return getDatabase()
    .prepare<[string], SettingRow>('SELECT value FROM app_settings WHERE key = ?')
    .get(key)?.value;
};

const setSetting = (key: string, value: string) => {
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
      key,
      value
    });
};

const parseModelList = (value: string | undefined) => {
  if (!value) return defaultModels;

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) return defaultModels;

    const models = parsed
      .filter((model): model is string => typeof model === 'string')
      .map((model) => model.trim())
      .filter(Boolean);

    return models.length > 0 ? [...new Set(models)] : defaultModels;
  } catch {
    return defaultModels;
  }
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
  const existing = getSetting(systemPromptKey);

  setSetting(systemPromptKey, value);

  logWorkflow({
    level: 'info',
    message: 'settings.prompt.updated',
    details: {
      previousLength: existing?.length ?? null,
      previousHash: existing ? hashText(existing) : null,
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

export const getModelSettings = () => {
  const models = parseModelList(getSetting(modelListKey));
  const storedSelectedModel = getSetting(selectedModelKey);
  const selectedModel =
    storedSelectedModel && models.includes(storedSelectedModel) ? storedSelectedModel : models[0];

  if (!getSetting(modelListKey)) {
    setSetting(modelListKey, JSON.stringify(models));
  }

  if (!storedSelectedModel || storedSelectedModel !== selectedModel) {
    setSetting(selectedModelKey, selectedModel);
  }

  return {
    models,
    selectedModel
  };
};

export const getSelectedModel = () => {
  return getModelSettings().selectedModel;
};

export const setModelSettings = (input: { models: string[]; selectedModel: string }) => {
  const models = [...new Set(input.models.map((model) => model.trim()).filter(Boolean))];

  if (models.length === 0) {
    throw new Error('At least one model is required');
  }

  const selectedModel = input.selectedModel.trim();

  if (!models.includes(selectedModel)) {
    throw new Error('Selected model must be in the model list');
  }

  const existing = getModelSettings();

  setSetting(modelListKey, JSON.stringify(models));
  setSetting(selectedModelKey, selectedModel);

  logWorkflow({
    level: 'info',
    message: 'settings.model.updated',
    details: {
      previousSelectedModel: existing.selectedModel,
      selectedModel,
      previousModelCount: existing.models.length,
      modelCount: models.length,
      models
    }
  });

  return {
    models,
    selectedModel
  };
};
