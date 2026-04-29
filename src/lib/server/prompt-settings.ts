export {
  getPromptTemplates,
  getSelectedModel,
  logSettingsFailure,
  resetPromptTemplates,
  getSystemPrompt,
  resetSystemPrompt,
  setPromptTemplates,
  setSystemPrompt
} from './app-settings';

import { getAppSettingsSnapshot, getOpenAISettings, updateAppSettings } from './app-settings';

export const getModelSettings = () => {
  const settings = getOpenAISettings();

  return {
    models: settings.models,
    selectedModel: settings.selectedModel
  };
};

export const setModelSettings = (input: { models: string[]; selectedModel: string }) => {
  const current = getOpenAISettings();
  const snapshot = getAppSettingsSnapshot();
  const result = updateAppSettings({
    openai: {
      models: input.models,
      selectedModel: input.selectedModel
    },
    github: {
      enabled: snapshot.github.enabled,
      owner: snapshot.github.owner,
      repo: snapshot.github.repo,
      branch: snapshot.github.branch,
      blogPostPath: snapshot.github.blogPostPath,
      unpublishStrategy: snapshot.github.unpublishStrategy
    },
    markdownExport: {
      downloadEnabled: snapshot.markdownExport.downloadEnabled,
      diskExportEnabled: snapshot.markdownExport.diskExportEnabled,
      diskExportPath: snapshot.markdownExport.diskExportPath
    },
    frontmatter: snapshot.frontmatter
  });

  return {
    models: result.settings.openai.models,
    selectedModel: result.settings.openai.selectedModel,
    previousSelectedModel: current.selectedModel
  };
};
