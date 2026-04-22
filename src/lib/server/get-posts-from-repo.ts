import { env } from 'process';
import { getOctokit } from './clients';

export const getPostsFromRepo = async (slug: string): Promise<string> => {
  const octokit = getOctokit();

  const fileName = `${slug}.md`;

  const response = await octokit.rest.repos.getContent({
    owner: env.GITHUB_REPO_OWNER ?? '',
    repo: env.GITHUB_REPO ?? '',
    path: `${env.GITHUB_REPO_BLOG_POST_PATH}/${fileName}`,
    ref: 'main'
  });

  if (Array.isArray(response.data) || response.data.type !== 'file') {
    throw new Error(`${env.GITHUB_REPO_BLOG_POST_PATH}/${fileName} is not a file`);
  }

  return Buffer.from(response.data.content, 'base64').toString('utf-8');
};
