import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { RequestError } from 'octokit';
import { getOctokit } from './clients';

const getGitHubRepoConfig = () => {
  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO;
  const blogPostPath = env.GITHUB_REPO_BLOG_POST_PATH;
  const ref = env.GITHUB_REPO_REF ?? 'main';

  if (!owner || !repo || !blogPostPath) {
    error(500, 'GitHub repo configuration is incomplete');
  }

  return {
    owner,
    repo,
    blogPostPath: blogPostPath.replace(/^\/+|\/+$/g, ''),
    ref
  };
};

export const getPostsFromRepo = async (slug: string): Promise<string> => {
  const octokit = getOctokit();
  const config = getGitHubRepoConfig();
  const fileName = `${slug}.md`;
  const path = `${config.blogPostPath}/${fileName}`;

  try {
    const response = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.ref
    });

    if (Array.isArray(response.data) || response.data.type !== 'file') {
      error(404, `${path} is not a file`);
    }

    return Buffer.from(response.data.content, 'base64').toString('utf-8');
  } catch (cause) {
    if (cause instanceof RequestError && cause.status === 404) {
      error(404, `No blog post was found for slug: ${slug}`);
    }

    throw cause;
  }
};
