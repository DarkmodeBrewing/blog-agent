import { error } from '@sveltejs/kit';
import { RequestError } from 'octokit';
import { getGitHubPublishSettings } from './app-settings';
import { getOctokit } from './clients';

export type GitHubBlogPostFile = {
  path: string;
  sha: string;
  content: string;
};

export const getGitHubRepoConfig = () => {
  const settings = getGitHubPublishSettings();
  const owner = settings.owner;
  const repo = settings.repo;
  const blogPostPath = settings.blogPostPath;
  const ref = settings.branch;

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

export const getGitHubBlogPostFiles = async (): Promise<GitHubBlogPostFile[]> => {
  const octokit = getOctokit();
  const config = getGitHubRepoConfig();
  const branch = await octokit.rest.repos.getBranch({
    owner: config.owner,
    repo: config.repo,
    branch: config.ref
  });
  const tree = await octokit.rest.git.getTree({
    owner: config.owner,
    repo: config.repo,
    tree_sha: branch.data.commit.sha,
    recursive: 'true'
  });
  const markdownFiles = tree.data.tree.filter(
    (item) =>
      item.type === 'blob' &&
      item.path?.startsWith(`${config.blogPostPath}/`) &&
      item.path.endsWith('.md') &&
      item.sha
  );

  return Promise.all(
    markdownFiles.map(async (item) => {
      const blob = await octokit.rest.git.getBlob({
        owner: config.owner,
        repo: config.repo,
        file_sha: item.sha as string
      });

      return {
        path: item.path as string,
        sha: item.sha as string,
        content: Buffer.from(blob.data.content, 'base64').toString('utf-8')
      };
    })
  );
};
