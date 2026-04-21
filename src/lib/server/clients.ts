import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import OpenAI from 'openai';

let openai: OpenAI | undefined;
let octokit: Octokit | undefined;

export const getOpenAI = () => {
  if (!env.OPENAI_API_KEY) {
    error(500, 'OPENAI_API_KEY is not configured');
  }

  openai ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return openai;
};

export const getOctokit = () => {
  if (!env.GITHUB_TOKEN) {
    error(500, 'GITHUB_TOKEN is not configured');
  }

  octokit ??= new Octokit({ auth: env.GITHUB_TOKEN });

  return octokit;
};

export const getIntegrationStatus = () => ({
  github: Boolean(env.GITHUB_TOKEN),
  openai: Boolean(env.OPENAI_API_KEY)
});
