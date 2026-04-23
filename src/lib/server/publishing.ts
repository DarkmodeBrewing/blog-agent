import matter from 'gray-matter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  getFrontmatterTemplate,
  getGitHubPublishSettings,
  getMarkdownExportSettings
} from './app-settings';
import { getOctokit } from './clients';
import { getPostBySlug, type PostRecord, upsertPost } from './post-library';
import { getGitHubRepoConfig } from './get-posts-from-repo';
import { logWorkflow } from './workflow-log';

export type PublishTarget =
  | 'markdown_download'
  | 'markdown_disk_export'
  | 'github_repo'
  | 'cms_contentful'
  | 'social_x'
  | 'social_linkedin';

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
  const frontmatter: Record<string, unknown> = {};

  if (template.title) frontmatter.title = post.title;
  if (template.slug) frontmatter.slug = post.slug;
  if (template.ingress && post.ingress) frontmatter.ingress = post.ingress;
  if (template.tags) frontmatter.tags = post.tags;

  const category = typeof post.frontmatter.category === 'string' ? post.frontmatter.category : null;
  if (template.category && category) frontmatter.category = category;

  const date = typeof post.frontmatter.date === 'string' ? post.frontmatter.date : null;
  if (template.date) frontmatter.date = date ?? new Date().toISOString();

  if (template.draft) {
    frontmatter.draft =
      typeof post.frontmatter.draft === 'boolean' ? post.frontmatter.draft : template.draftDefault;
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

const markPostPublished = (
  post: PostRecord,
  input?: {
    githubPath?: string | null;
    githubSha?: string | null;
    source?: PostRecord['source'];
    statusNotes?: string;
  }
) => {
  return upsertPost({
    slug: post.slug,
    title: post.title,
    ingress: post.ingress,
    body: post.body,
    frontmatter: post.frontmatter,
    tags: post.tags,
    status: 'committed',
    githubPath: input?.githubPath ?? post.githubPath,
    githubSha: input?.githubSha ?? post.githubSha,
    source: input?.source ?? post.source,
    statusNotes: input?.statusNotes ?? 'Published through adapter layer'
  }).post;
};

const publishMarkdownDownload = (post: PostRecord): PublishResult => {
  const artifact = renderPostAsMarkdown(post);
  const publishedPost = markPostPublished(post, {
    statusNotes: 'Exported as Markdown download'
  });

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

  const publishedPost = markPostPublished(post, {
    statusNotes: 'Exported to server disk'
  });

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

  const publishedPost = markPostPublished(post, {
    githubPath: path,
    githubSha: result.data.content?.sha ?? currentSha ?? null,
    source: 'github',
    statusNotes: 'Published to GitHub'
  });

  const remoteUrl = result.data.content?.html_url ?? null;

  logWorkflow({
    level: 'info',
    message: 'post.publish.completed',
    details: {
      slug: publishedPost.slug,
      target: 'github_repo',
      path,
      sha: publishedPost.githubSha,
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
