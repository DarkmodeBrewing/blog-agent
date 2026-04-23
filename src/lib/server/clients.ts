import { error } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import OpenAI from 'openai';
import { getGitHubPublishSettings, getOpenAISettings } from './app-settings';

let openai: OpenAI | undefined;
let openaiApiKey: string | undefined;
let octokit: Octokit | undefined;
let githubToken: string | undefined;

export const getOpenAI = () => {
  const settings = getOpenAISettings();

  if (!settings.apiKey) {
    error(500, 'OPENAI_API_KEY is not configured');
  }

  if (!openai || openaiApiKey !== settings.apiKey) {
    openai = new OpenAI({ apiKey: settings.apiKey });
    openaiApiKey = settings.apiKey;
  }

  return openai;
};

export const getOctokit = () => {
  const settings = getGitHubPublishSettings();

  if (!settings.token) {
    error(500, 'GITHUB_TOKEN is not configured');
  }

  if (!octokit || githubToken !== settings.token) {
    octokit = new Octokit({ auth: settings.token });
    githubToken = settings.token;
  }

  return octokit;
};
