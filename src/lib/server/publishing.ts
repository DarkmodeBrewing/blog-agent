import matter from 'gray-matter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  getFrontmatterTemplate,
  getGitHubPublishSettings,
  getMarkdownExportSettings
} from './app-settings';
import { getOctokit } from './clients';
import {
  getPostBySlug,
  recordPostPublication,
  type PostRecord,
  type PublishTarget as PostPublishTarget
} from './post-library';
import { getGitHubRepoConfig } from './get-posts-from-repo';
import { logWorkflow } from './workflow-log';

export type PublishTarget = PostPublishTarget;

export type PublishTargetDefinition = {
  id: PublishTarget;
  label: string;
  description: string;
  implemented: boolean;
  requiresConfiguration: boolean;
  kind: 'markdown' | 'repository' | 'cms' | 'social';
};

export type PublishArtifact = {
  filename: string;
  content: string;
  contentType: 'text/markdown; charset=utf-8';
};

export type PublishResult = {
  target: PublishTarget;
  post: PostRecord;
  artifact?: PublishArtifact;
  filePath?: string;
  remoteUrl?: string;
  commitSha?: string;
};

const publishTargetDefinitions: PublishTargetDefinition[] = [
  {
    id: 'markdown_download',
    label: 'Markdown download',
    description: 'Return a Markdown artifact that can be downloaded in the browser.',
    implemented: true,
    requiresConfiguration: false,
    kind: 'markdown'
  },
  {
    id: 'markdown_disk_export',
    label: 'Markdown disk export',
    description: 'Write Markdown to a configured server-side export directory.',
    implemented: true,
    requiresConfiguration: true,
    kind: 'markdown'
  },
  {
    id: 'github_repo',
    label: 'GitHub repository',
    description: 'Commit Markdown into a configured GitHub repository.',
    implemented: true,
    requiresConfiguration: true,
    kind: 'repository'
  },
  {
    id: 'cms_contentful',
    label: 'Contentful',
    description: 'Reserved CMS adapter placeholder.',
    implemented: false,
    requiresConfiguration: true,
    kind: 'cms'
  },
  {
    id: 'social_x',
    label: 'X',
    description: 'Reserved social adapter placeholder.',
    implemented: false,
    requiresConfiguration: true,
    kind: 'social'
  },
  {
    id: 'social_linkedin',
    label: 'LinkedIn',
    description: 'Reserved social adapter placeholder.',
    implemented: false,
    requiresConfiguration: true,
    kind: 'social'
  }
];

const targetSet = new Set<PublishTarget>(publishTargetDefinitions.map((target) => target.id));

const buildFrontmatter = (post: PostRecord) => {
  const template = getFrontmatterTemplate();
  const values: Record<string, unknown> = {
    title: template.title ? post.title : undefined,
    slug: template.slug ? post.slug : undefined,
    ingress: template.ingress && post.ingress ? post.ingress : undefined,
    tags: template.tags ? post.tags : undefined,
    category: template.category
      ? typeof post.frontmatter.category === 'string' && post.frontmatter.category
        ? post.frontmatter.category
        : template.defaults.category || undefined
      : undefined,
    date: template.date
      ? typeof post.frontmatter.date === 'string' && post.frontmatter.date
        ? post.frontmatter.date
        : template.defaults.date || new Date().toISOString()
      : undefined,
    draft: template.draft
      ? typeof post.frontmatter.draft === 'boolean'
        ? post.frontmatter.draft
        : template.defaults.draft
      : undefined
  };

  const frontmatter: Record<string, unknown> = {};

  for (const field of template.order) {
    const value = values[field];

    if (value !== undefined) {
      frontmatter[field] = value;
    }
  }

  return frontmatter;
};

export const renderPostAsMarkdown = (post: PostRecord) => {
  const frontmatter = buildFrontmatter(post);
  const hasFrontmatter = Object.keys(frontmatter).length > 0;
  const content = hasFrontmatter ? matter.stringify(post.body, frontmatter) : post.body;

  return {
    filename: `${post.slug}.md`,
    content,
    contentType: 'text/markdown; charset=utf-8' as const
  };
};

const publishMarkdownDownload = (post: PostRecord): PublishResult => {
  const artifact = renderPostAsMarkdown(post);
  const publishedPost = recordPostPublication(post.slug, {
    target: 'markdown_download',
    status: 'published',
    artifact
  });

  if (!publishedPost) {
    throw new Error(`Post not found while recording publication: ${post.slug}`);
  }

  logWorkflow({
    level: 'info',
    message: 'post.publish.completed',
    details: {
      slug: post.slug,
      target: 'markdown_download',
      filename: artifact.filename,
      contentLength: artifact.content.length
    }
  });

  return {
    target: 'markdown_download',
    post: publishedPost,
    artifact
  };
};

const publishMarkdownDiskExport = (post: PostRecord): PublishResult => {
  const settings = getMarkdownExportSettings();

  if (!settings.diskExportEnabled) {
    throw new Error('Markdown disk export is not enabled');
  }

  if (!settings.diskExportPath) {
    throw new Error('Markdown disk export path is not configured');
  }

  const artifact = renderPostAsMarkdown(post);
  const filePath = resolve(settings.diskExportPath, artifact.filename);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, artifact.content, 'utf-8');

  const publishedPost = recordPostPublication(post.slug, {
    target: 'markdown_disk_export',
    status: 'published',
    artifact,
    filePath
  });

  if (!publishedPost) {
    throw new Error(`Post not found while recording publication: ${post.slug}`);
  }

  logWorkflow({
    level: 'info',
    message: 'post.publish.completed',
    details: {
      slug: post.slug,
      target: 'markdown_disk_export',
      filePath,
      contentLength: artifact.content.length
    }
  });

  return {
    target: 'markdown_disk_export',
    post: publishedPost,
    artifact,
    filePath
  };
};

const publishGitHubRepo = async (post: PostRecord): Promise<PublishResult> => {
  const octokit = getOctokit();
  const config = getGitHubRepoConfig();
  const path = post.githubPath ?? `${config.blogPostPath}/${post.slug}.md`;
  const artifact = renderPostAsMarkdown(post);

  logWorkflow({
    level: 'info',
    message: 'post.publish.started',
    details: {
      slug: post.slug,
      title: post.title,
      target: 'github_repo',
      path,
      repo: `${config.owner}/${config.repo}`,
      ref: config.ref
    }
  });

  let currentSha = post.githubSha ?? undefined;

  if (!currentSha) {
    try {
      const existing = await octokit.rest.repos.getContent({
        owner: config.owner,
        repo: config.repo,
        path,
        ref: config.ref
      });

      if (!Array.isArray(existing.data) && existing.data.type === 'file') {
        currentSha = existing.data.sha;
      }
    } catch {
      currentSha = undefined;
    }
  }

  const result = await octokit.rest.repos.createOrUpdateFileContents({
    owner: config.owner,
    repo: config.repo,
    path,
    branch: config.ref,
    message: `Publish blog post: ${post.title}`,
    content: Buffer.from(artifact.content).toString('base64'),
    sha: currentSha
  });

  const publishedPost = recordPostPublication(post.slug, {
    target: 'github_repo',
    status: 'published',
    artifact,
    remoteUrl: result.data.content?.html_url ?? null,
    filePath: path,
    commitSha: result.data.commit.sha,
    externalId: result.data.content?.sha ?? currentSha ?? null
  });

  if (!publishedPost) {
    throw new Error(`Post not found while recording publication: ${post.slug}`);
  }

  const remoteUrl = result.data.content?.html_url ?? null;

  logWorkflow({
    level: 'info',
    message: 'post.publish.completed',
    details: {
      slug: publishedPost.slug,
      target: 'github_repo',
      path,
      sha: result.data.content?.sha ?? currentSha ?? null,
      commitSha: result.data.commit.sha,
      remoteUrl
    }
  });

  return {
    target: 'github_repo',
    post: publishedPost,
    artifact,
    commitSha: result.data.commit.sha,
    remoteUrl: remoteUrl ?? undefined
  };
};

export const listPublishTargets = () => {
  const markdownSettings = getMarkdownExportSettings();
  const githubSettings = getGitHubPublishSettings();

  return publishTargetDefinitions.map((target) => ({
    ...target,
    enabled:
      target.id === 'markdown_download'
        ? markdownSettings.downloadEnabled
        : target.id === 'markdown_disk_export'
          ? markdownSettings.diskExportEnabled
          : target.id === 'github_repo'
            ? githubSettings.enabled
            : false
  }));
};

export const isPublishTarget = (value: string): value is PublishTarget =>
  targetSet.has(value as PublishTarget);

export const isPublishTargetReady = (target: PublishTarget) => {
  const markdownSettings = getMarkdownExportSettings();
  const githubSettings = getGitHubPublishSettings();

  switch (target) {
    case 'markdown_download':
      return markdownSettings.downloadEnabled;
    case 'markdown_disk_export':
      return markdownSettings.diskExportEnabled && Boolean(markdownSettings.diskExportPath);
    case 'github_repo':
      return (
        githubSettings.enabled &&
        Boolean(githubSettings.token) &&
        Boolean(githubSettings.owner) &&
        Boolean(githubSettings.repo) &&
        Boolean(githubSettings.branch) &&
        Boolean(githubSettings.blogPostPath)
      );
    default:
      return false;
  }
};

export const publishPost = async (
  slug: string,
  target: PublishTarget = 'markdown_download'
): Promise<PublishResult | null> => {
  const definition = publishTargetDefinitions.find((item) => item.id === target);
  if (!definition) {
    throw new Error(`Unsupported publish target: ${target}`);
  }

  if (!definition.implemented) {
    throw new Error(`Publish target is not implemented yet: ${target}`);
  }

  if (!isPublishTargetReady(target)) {
    throw new Error(`Publish target is not configured: ${target}`);
  }

  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  if (post.status !== 'approved') {
    throw new Error(`Post must be approved before publishing. Current status: ${post.status}`);
  }

  switch (target) {
    case 'markdown_download':
      return publishMarkdownDownload(post);
    case 'markdown_disk_export':
      return publishMarkdownDiskExport(post);
    case 'github_repo':
      return publishGitHubRepo(post);
    default:
      throw new Error(`Publish target is not implemented yet: ${target}`);
  }
};
