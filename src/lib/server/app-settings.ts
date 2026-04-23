import { z } from 'zod/v4';
import {
  composeSystemPrompt,
  defaultPromptTemplates,
  systemsPrompt,
  type PromptTemplates
} from '../../openai/prompts';
import { getErrorMessage, hashText, logWorkflow } from './workflow-log';
import { getSettingValue, setSettingValue } from './repositories/settings-repository';

const settingKeys = {
  systemPrompt: 'system_prompt',
  promptSharedVoice: 'prompt_shared_voice',
  promptBlogGeneration: 'prompt_blog_generation',
  promptSocialGeneration: 'prompt_social_generation',
  promptGuardrails: 'prompt_guardrails',
  openaiApiKey: 'openai_api_key',
  openaiModelList: 'openai_model_list',
  openaiSelectedModel: 'openai_selected_model',
  githubEnabled: 'github_publish_enabled',
  githubToken: 'github_token',
  githubOwner: 'github_repo_owner',
  githubRepo: 'github_repo_name',
  githubBranch: 'github_repo_branch',
  githubContentPath: 'github_repo_blog_post_path',
  markdownDownloadEnabled: 'markdown_download_enabled',
  markdownDiskExportEnabled: 'markdown_disk_export_enabled',
  markdownDiskExportPath: 'markdown_disk_export_path',
  frontmatterTemplate: 'blog_frontmatter_template'
} as const;

const defaultModels = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'];
const frontmatterFieldNames = [
  'title',
  'slug',
  'ingress',
  'tags',
  'category',
  'date',
  'draft'
] as const;
const FrontmatterFieldSchema = z.enum(frontmatterFieldNames);
export type FrontmatterField = (typeof frontmatterFieldNames)[number];

const FrontmatterTemplateSchema = z.object({
  title: z.boolean().default(true),
  slug: z.boolean().default(true),
  ingress: z.boolean().default(true),
  tags: z.boolean().default(true),
  category: z.boolean().default(false),
  date: z.boolean().default(false),
  draft: z.boolean().default(false),
  defaults: z
    .object({
      category: z.string().default(''),
      date: z.string().default(''),
      draft: z.boolean().default(true)
    })
    .default({
      category: '',
      date: '',
      draft: true
    }),
  order: z
    .array(FrontmatterFieldSchema)
    .default([...frontmatterFieldNames])
    .transform((fields) => {
      const unique = [...new Set(fields)];

      for (const field of frontmatterFieldNames) {
        if (!unique.includes(field)) {
          unique.push(field);
        }
      }

      return unique;
    })
});

export type FrontmatterTemplate = z.infer<typeof FrontmatterTemplateSchema>;

export type OpenAISettings = {
  apiKey: string;
  models: string[];
  selectedModel: string;
};

export type GitHubPublishSettings = {
  enabled: boolean;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  blogPostPath: string;
};

export type MarkdownExportSettings = {
  downloadEnabled: boolean;
  diskExportEnabled: boolean;
  diskExportPath: string;
};

export type AppSettingsSnapshot = {
  openai: {
    apiKeyConfigured: boolean;
    apiKeyMasked: string | null;
    models: string[];
    selectedModel: string;
  };
  github: {
    enabled: boolean;
    tokenConfigured: boolean;
    tokenMasked: string | null;
    owner: string;
    repo: string;
    branch: string;
    blogPostPath: string;
  };
  markdownExport: MarkdownExportSettings;
  frontmatter: FrontmatterTemplate;
};

export type PromptTemplateSnapshot = PromptTemplates & {
  composedPrompt: string;
};

export type AppReadinessIssue = {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  message: string;
  href: string;
};

export type AppReadiness = {
  status: 'ready' | 'ready_with_warnings' | 'incomplete';
  hasBlockingIssues: boolean;
  readyForGeneration: boolean;
  readyForGitHubPublishing: boolean;
  readyForGitHubSync: boolean;
  issues: AppReadinessIssue[];
};

type AppSettingsUpdateInput = {
  openai: {
    apiKey?: string;
    clearApiKey?: boolean;
    models: string[];
    selectedModel: string;
  };
  github: {
    enabled: boolean;
    token?: string;
    clearToken?: boolean;
    owner: string;
    repo: string;
    branch: string;
    blogPostPath: string;
  };
  markdownExport: MarkdownExportSettings;
  frontmatter: FrontmatterTemplate;
};

const getSetting = (key: string) => {
  return getSettingValue(key);
};

const setSetting = (key: string, value: string) => {
  setSettingValue(key, value);
};

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;

  return value === 'true';
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

const parseFrontmatterTemplate = (value: string | undefined): FrontmatterTemplate => {
  if (!value) {
    return FrontmatterTemplateSchema.parse({});
  }

  try {
    return FrontmatterTemplateSchema.parse(JSON.parse(value) as unknown);
  } catch {
    return FrontmatterTemplateSchema.parse({});
  }
};

const normalizePath = (value: string) => value.trim().replace(/^\/+|\/+$/g, '');

const maskSecret = (value: string) => {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***`;

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
};

const saveJsonSetting = (key: string, value: unknown) => {
  setSetting(key, JSON.stringify(value));
};

export const getSystemPrompt = () => {
  return getPromptTemplates().composedPrompt;
};

export const getPromptTemplates = (): PromptTemplateSnapshot => {
  const sharedVoice =
    getSetting(settingKeys.promptSharedVoice)?.trim() || defaultPromptTemplates.sharedVoice;
  const blogGeneration =
    getSetting(settingKeys.promptBlogGeneration)?.trim() || defaultPromptTemplates.blogGeneration;
  const socialGeneration =
    getSetting(settingKeys.promptSocialGeneration)?.trim() ||
    defaultPromptTemplates.socialGeneration;
  const guardrails =
    getSetting(settingKeys.promptGuardrails)?.trim() || defaultPromptTemplates.guardrails;

  if (!getSetting(settingKeys.promptSharedVoice)) {
    setSetting(settingKeys.promptSharedVoice, sharedVoice);
  }

  if (!getSetting(settingKeys.promptBlogGeneration)) {
    setSetting(settingKeys.promptBlogGeneration, blogGeneration);
  }

  if (!getSetting(settingKeys.promptSocialGeneration)) {
    setSetting(settingKeys.promptSocialGeneration, socialGeneration);
  }

  if (!getSetting(settingKeys.promptGuardrails)) {
    setSetting(settingKeys.promptGuardrails, guardrails);
  }

  return {
    sharedVoice,
    blogGeneration,
    socialGeneration,
    guardrails,
    composedPrompt: composeSystemPrompt({
      sharedVoice,
      blogGeneration,
      socialGeneration,
      guardrails
    })
  };
};

export const setPromptTemplates = (value: PromptTemplates) => {
  const existing = getPromptTemplates();
  setSetting(settingKeys.promptSharedVoice, value.sharedVoice.trim());
  setSetting(settingKeys.promptBlogGeneration, value.blogGeneration.trim());
  setSetting(settingKeys.promptSocialGeneration, value.socialGeneration.trim());
  setSetting(settingKeys.promptGuardrails, value.guardrails.trim());
  const updated = getPromptTemplates();

  logWorkflow({
    level: 'info',
    message: 'settings.prompt.updated',
    details: {
      previousLength: existing.composedPrompt.length,
      previousHash: hashText(existing.composedPrompt),
      newLength: updated.composedPrompt.length,
      newHash: hashText(updated.composedPrompt),
      sections: {
        sharedVoice: value.sharedVoice.length,
        blogGeneration: value.blogGeneration.length,
        socialGeneration: value.socialGeneration.length,
        guardrails: value.guardrails.length
      }
    }
  });

  return updated;
};

export const setSystemPrompt = (value: string) =>
  setPromptTemplates({
    ...getPromptTemplates(),
    sharedVoice: value
  }).composedPrompt;

export const resetPromptTemplates = () => setPromptTemplates(defaultPromptTemplates);

export const resetSystemPrompt = () => {
  resetPromptTemplates();
  return systemsPrompt;
};

export const getOpenAISettings = (): OpenAISettings => {
  const models = parseModelList(getSetting(settingKeys.openaiModelList));
  const storedSelectedModel = getSetting(settingKeys.openaiSelectedModel)?.trim();
  const selectedModel =
    storedSelectedModel && models.includes(storedSelectedModel) ? storedSelectedModel : models[0];
  const apiKey = getSetting(settingKeys.openaiApiKey)?.trim() ?? '';

  if (!getSetting(settingKeys.openaiModelList)) {
    saveJsonSetting(settingKeys.openaiModelList, models);
  }

  if (!storedSelectedModel || storedSelectedModel !== selectedModel) {
    setSetting(settingKeys.openaiSelectedModel, selectedModel);
  }

  return {
    apiKey,
    models,
    selectedModel
  };
};

export const getGitHubPublishSettings = (): GitHubPublishSettings => ({
  enabled: parseBoolean(getSetting(settingKeys.githubEnabled), false),
  token: getSetting(settingKeys.githubToken)?.trim() ?? '',
  owner: getSetting(settingKeys.githubOwner)?.trim() ?? '',
  repo: getSetting(settingKeys.githubRepo)?.trim() ?? '',
  branch: getSetting(settingKeys.githubBranch)?.trim() || 'main',
  blogPostPath: normalizePath(getSetting(settingKeys.githubContentPath)?.trim() ?? '')
});

export const getMarkdownExportSettings = (): MarkdownExportSettings => ({
  downloadEnabled: parseBoolean(getSetting(settingKeys.markdownDownloadEnabled), true),
  diskExportEnabled: parseBoolean(getSetting(settingKeys.markdownDiskExportEnabled), false),
  diskExportPath: getSetting(settingKeys.markdownDiskExportPath)?.trim() ?? ''
});

export const getFrontmatterTemplate = () => {
  const template = parseFrontmatterTemplate(getSetting(settingKeys.frontmatterTemplate));

  if (!getSetting(settingKeys.frontmatterTemplate)) {
    saveJsonSetting(settingKeys.frontmatterTemplate, template);
  }

  return template;
};

export const getAppSettingsSnapshot = (): AppSettingsSnapshot => {
  const openai = getOpenAISettings();
  const github = getGitHubPublishSettings();
  const markdownExport = getMarkdownExportSettings();
  const frontmatter = getFrontmatterTemplate();

  return {
    openai: {
      apiKeyConfigured: Boolean(openai.apiKey),
      apiKeyMasked: maskSecret(openai.apiKey),
      models: openai.models,
      selectedModel: openai.selectedModel
    },
    github: {
      enabled: github.enabled,
      tokenConfigured: Boolean(github.token),
      tokenMasked: maskSecret(github.token),
      owner: github.owner,
      repo: github.repo,
      branch: github.branch,
      blogPostPath: github.blogPostPath
    },
    markdownExport,
    frontmatter
  };
};

export const getSelectedModel = () => getOpenAISettings().selectedModel;

export const getReadiness = (): AppReadiness => {
  const settings = getAppSettingsSnapshot();
  const issues: AppReadinessIssue[] = [];

  if (!settings.openai.apiKeyConfigured) {
    issues.push({
      id: 'openai-api-key-missing',
      severity: 'error',
      title: 'OpenAI API key required',
      message: 'Add an OpenAI API key in Settings before generating content.',
      href: '/settings'
    });
  }

  if (
    settings.github.enabled &&
    (!settings.github.tokenConfigured ||
      !settings.github.owner ||
      !settings.github.repo ||
      !settings.github.branch ||
      !settings.github.blogPostPath)
  ) {
    issues.push({
      id: 'github-publish-incomplete',
      severity: 'warning',
      title: 'GitHub publishing is incomplete',
      message: 'GitHub publishing is enabled, but token or repository settings are missing.',
      href: '/settings'
    });
  }

  if (settings.markdownExport.diskExportEnabled && !settings.markdownExport.diskExportPath) {
    issues.push({
      id: 'disk-export-path-missing',
      severity: 'warning',
      title: 'Disk export path missing',
      message: 'Disk export is enabled, but no server-side export path has been configured.',
      href: '/settings'
    });
  }

  const hasBlockingIssues = issues.some((issue) => issue.severity === 'error');
  const readyForGitHub =
    settings.github.enabled &&
    settings.github.tokenConfigured &&
    Boolean(settings.github.owner) &&
    Boolean(settings.github.repo) &&
    Boolean(settings.github.branch) &&
    Boolean(settings.github.blogPostPath);

  return {
    status: hasBlockingIssues ? 'incomplete' : issues.length > 0 ? 'ready_with_warnings' : 'ready',
    hasBlockingIssues,
    readyForGeneration: settings.openai.apiKeyConfigured,
    readyForGitHubPublishing: readyForGitHub,
    readyForGitHubSync: readyForGitHub,
    issues
  };
};

export const updateAppSettings = (input: AppSettingsUpdateInput) => {
  const existing = getAppSettingsSnapshot();

  const openaiModels = [
    ...new Set(input.openai.models.map((model) => model.trim()).filter(Boolean))
  ];
  if (openaiModels.length === 0) {
    throw new Error('At least one OpenAI model is required');
  }

  if (!openaiModels.includes(input.openai.selectedModel.trim())) {
    throw new Error('Selected OpenAI model must be included in the model list');
  }

  const nextOpenAIApiKey = input.openai.clearApiKey
    ? ''
    : input.openai.apiKey !== undefined
      ? input.openai.apiKey.trim()
      : getOpenAISettings().apiKey;

  const nextGitHubToken = input.github.clearToken
    ? ''
    : input.github.token !== undefined
      ? input.github.token.trim()
      : getGitHubPublishSettings().token;

  setSetting(settingKeys.openaiApiKey, nextOpenAIApiKey);
  saveJsonSetting(settingKeys.openaiModelList, openaiModels);
  setSetting(settingKeys.openaiSelectedModel, input.openai.selectedModel.trim());

  setSetting(settingKeys.githubEnabled, String(input.github.enabled));
  setSetting(settingKeys.githubToken, nextGitHubToken);
  setSetting(settingKeys.githubOwner, input.github.owner.trim());
  setSetting(settingKeys.githubRepo, input.github.repo.trim());
  setSetting(settingKeys.githubBranch, input.github.branch.trim() || 'main');
  setSetting(settingKeys.githubContentPath, normalizePath(input.github.blogPostPath));

  setSetting(settingKeys.markdownDownloadEnabled, String(input.markdownExport.downloadEnabled));
  setSetting(settingKeys.markdownDiskExportEnabled, String(input.markdownExport.diskExportEnabled));
  setSetting(settingKeys.markdownDiskExportPath, input.markdownExport.diskExportPath.trim());

  saveJsonSetting(
    settingKeys.frontmatterTemplate,
    FrontmatterTemplateSchema.parse(input.frontmatter)
  );

  const updated = getAppSettingsSnapshot();

  logWorkflow({
    level: 'info',
    message: 'settings.app.updated',
    details: {
      openaiConfigured: updated.openai.apiKeyConfigured,
      previousOpenAIConfigured: existing.openai.apiKeyConfigured,
      selectedModel: updated.openai.selectedModel,
      githubEnabled: updated.github.enabled,
      githubConfigured: updated.github.tokenConfigured,
      markdownDownloadEnabled: updated.markdownExport.downloadEnabled,
      markdownDiskExportEnabled: updated.markdownExport.diskExportEnabled,
      frontmatterFieldsEnabled: Object.entries(updated.frontmatter)
        .filter(([key, enabled]) => key !== 'defaults' && key !== 'order' && enabled)
        .map(([key]) => key)
    }
  });

  return {
    settings: updated,
    readiness: getReadiness()
  };
};

export const getIntegrationStatus = () => {
  const settings = getAppSettingsSnapshot();

  return {
    openai: settings.openai.apiKeyConfigured,
    github: settings.github.enabled && settings.github.tokenConfigured
  };
};

export const logSettingsFailure = (message: string, cause: unknown) => {
  logWorkflow({
    level: 'error',
    message,
    details: {
      error: getErrorMessage(cause)
    }
  });
};
