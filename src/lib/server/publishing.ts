import matter from 'gray-matter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import prettier from 'prettier';
import {
  getFrontmatterTemplate,
  getGitHubPublishSettings,
  getMarkdownExportSettings
} from './app-settings';
import { getOctokit } from './clients';
import {
  getLatestPublicationForTarget,
  getPostBySlug,
  recordPostPublication,
  type PostRecord,
  type PublishTarget as PostPublishTarget
} from './post-library';
import { getGitHubRepoConfig } from './get-posts-from-repo';
import { getPublishTargetKind } from './publication-targets';
import { logWorkflow } from './workflow-log';

export type PublishTarget = PostPublishTarget;

export type PublishTargetDefinition = {
  id: PublishTarget;
  label: string;
  description: string;
  implemented: boolean;
  requiresConfiguration: boolean;
  kind: 'export' | 'live_publication';
  channel: 'markdown' | 'repository' | 'cms' | 'social';
  supportsUnpublish: boolean;
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
    kind: 'export',
    channel: 'markdown',
    supportsUnpublish: false
  },
  {
    id: 'markdown_disk_export',
    label: 'Markdown disk export',
    description: 'Write Markdown to a configured server-side export directory.',
    implemented: true,
    requiresConfiguration: true,
    kind: 'export',
    channel: 'markdown',
    supportsUnpublish: false
  },
  {
    id: 'github_repo',
    label: 'GitHub repository',
    description: 'Commit Markdown into a configured GitHub repository.',
    implemented: true,
    requiresConfiguration: true,
    kind: 'live_publication',
    channel: 'repository',
    supportsUnpublish: true
  },
  {
    id: 'cms_contentful',
    label: 'Contentful',
    description: 'Reserved CMS adapter placeholder.',
    implemented: false,
    requiresConfiguration: true,
    kind: 'live_publication',
    channel: 'cms',
    supportsUnpublish: false
  },
  {
    id: 'social_x',
    label: 'X',
    description: 'Reserved social adapter placeholder.',
    implemented: false,
    requiresConfiguration: true,
    kind: 'live_publication',
    channel: 'social',
    supportsUnpublish: false
  },
  {
    id: 'social_linkedin',
    label: 'LinkedIn',
    description: 'Reserved social adapter placeholder.',
    implemented: false,
    requiresConfiguration: true,
    kind: 'live_publication',
    channel: 'social',
    supportsUnpublish: false
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

const formatMarkdown = async (content: string) => {
  try {
    return await prettier.format(content, {
      parser: 'markdown'
    });
  } catch {
    return content;
  }
};

export const renderPostAsMarkdown = async (post: PostRecord) => {
  const frontmatter = buildFrontmatter(post);
  const hasFrontmatter = Object.keys(frontmatter).length > 0;
  const rawContent = hasFrontmatter ? matter.stringify(post.body, frontmatter) : post.body;
  const content = await formatMarkdown(rawContent);

  return {
    filename: `${post.slug}.md`,
    content,
    contentType: 'text/markdown; charset=utf-8' as const
  };
};

const publishMarkdownDownload = async (
  post: PostRecord,
  options?: { actionId?: string | null; requestId?: string | null }
): Promise<PublishResult> => {
  const artifact = await renderPostAsMarkdown(post);
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
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug: post.slug,
      target: 'markdown_download'
    },
    details: {
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

const publishMarkdownDiskExport = async (
  post: PostRecord,
  options?: { actionId?: string | null; requestId?: string | null }
): Promise<PublishResult> => {
  const settings = getMarkdownExportSettings();

  if (!settings.diskExportEnabled) {
    throw new Error('Markdown disk export is not enabled');
  }

  if (!settings.diskExportPath) {
    throw new Error('Markdown disk export path is not configured');
  }

  const artifact = await renderPostAsMarkdown(post);
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
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug: post.slug,
      target: 'markdown_disk_export'
    },
    details: {
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

const publishGitHubRepo = async (
  post: PostRecord,
  options?: { actionId?: string | null; requestId?: string | null }
): Promise<PublishResult> => {
  const octokit = getOctokit();
  const config = getGitHubRepoConfig();
  const path = post.githubPath ?? `${config.blogPostPath}/${post.slug}.md`;
  const artifact = await renderPostAsMarkdown(post);

  logWorkflow({
    level: 'info',
    message: 'post.publish.started',
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug: post.slug,
      target: 'github_repo'
    },
    details: {
      title: post.title,
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
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug: publishedPost.slug,
      target: 'github_repo'
    },
    details: {
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

export const canUnpublishTarget = (target: PublishTarget) => {
  const definition = publishTargetDefinitions.find((item) => item.id === target);
  return Boolean(definition?.implemented && definition.supportsUnpublish);
};

export const publishPost = async (
  slug: string,
  target: PublishTarget = 'markdown_download',
  options?: { actionId?: string | null; requestId?: string | null }
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

  logWorkflow({
    level: 'info',
    message: 'post.publish.attempted',
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug,
      target
    },
    details: {
      targetKind: getPublishTargetKind(target),
      editable: post.isEditable,
      publishedTargets: post.publicationSummary.publishedTargets
    }
  });

  if (post.status !== 'approved') {
    throw new Error(`Post must be approved before publishing. Current status: ${post.status}`);
  }

  switch (target) {
    case 'markdown_download':
      return publishMarkdownDownload(post, options);
    case 'markdown_disk_export':
      return publishMarkdownDiskExport(post, options);
    case 'github_repo':
      return publishGitHubRepo(post, options);
    default:
      throw new Error(`Publish target is not implemented yet: ${target}`);
  }
};

const unpublishGitHubRepo = async (
  post: PostRecord,
  options?: { actionId?: string | null; requestId?: string | null; returnToDraft?: boolean }
) => {
  const octokit = getOctokit();
  const config = getGitHubRepoConfig();
  const githubSettings = getGitHubPublishSettings();
  const latestPublication = getLatestPublicationForTarget(post.slug, 'github_repo');

  if (!latestPublication || latestPublication.status !== 'published') {
    throw new Error('Post is not currently published to GitHub');
  }

  const path =
    latestPublication.filePath ?? post.githubPath ?? `${config.blogPostPath}/${post.slug}.md`;
  let sha = latestPublication.externalId ?? null;

  if (!sha) {
    const existing = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.ref
    });

    if (Array.isArray(existing.data) || existing.data.type !== 'file') {
      throw new Error(`GitHub path is not a file: ${path}`);
    }

    sha = existing.data.sha;
  }

  let commitSha: string;
  let externalId = sha;

  logWorkflow({
    level: 'info',
    message: 'post.unpublish.started',
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug: post.slug,
      target: 'github_repo'
    },
    details: {
      path,
      strategy: githubSettings.unpublishStrategy,
      repo: `${config.owner}/${config.repo}`,
      ref: config.ref
    }
  });

  if (githubSettings.unpublishStrategy === 'mark_frontmatter_draft') {
    const existing = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.ref
    });

    if (Array.isArray(existing.data) || existing.data.type !== 'file') {
      throw new Error(`GitHub path is not a file: ${path}`);
    }

    const currentContent = Buffer.from(existing.data.content, 'base64').toString('utf-8');
    const parsed = matter(currentContent);
    const updatedContent = await formatMarkdown(
      matter.stringify(parsed.content.trim(), {
        ...parsed.data,
        draft: true
      })
    );
    const result = await octokit.rest.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path,
      branch: config.ref,
      message: `Unpublish blog post: ${post.title}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: existing.data.sha
    });

    commitSha = result.data.commit.sha ?? '';
    externalId = result.data.content?.sha ?? existing.data.sha;
  } else {
    const result = await octokit.rest.repos.deleteFile({
      owner: config.owner,
      repo: config.repo,
      path,
      branch: config.ref,
      message: `Unpublish blog post: ${post.title}`,
      sha
    });

    commitSha = result.data.commit.sha ?? '';
  }

  const unpublishedPost = recordPostPublication(post.slug, {
    target: 'github_repo',
    status: 'unpublished',
    filePath: path,
    commitSha,
    externalId,
    remoteUrl: latestPublication.remoteUrl,
    artifact: latestPublication.artifact
  });

  if (!unpublishedPost) {
    throw new Error(`Post not found while recording unpublish: ${post.slug}`);
  }

  let nextPost = unpublishedPost;

  if (
    options?.returnToDraft &&
    unpublishedPost.publicationSummary.livePublishedTargets.length === 0
  ) {
    const { updatePostStatus } = await import('./post-library');
    nextPost =
      updatePostStatus(unpublishedPost.slug, 'draft', 'Returned to draft after unpublish') ??
      unpublishedPost;
  }

  logWorkflow({
    level: 'info',
    message: 'post.unpublish.completed',
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug: nextPost.slug,
      target: 'github_repo'
    },
    details: {
      path,
      strategy: githubSettings.unpublishStrategy,
      commitSha,
      returnedToDraft: Boolean(options?.returnToDraft)
    }
  });

  return {
    post: nextPost,
    commitSha
  };
};

export const unpublishPost = async (
  slug: string,
  target: PublishTarget,
  options?: { actionId?: string | null; requestId?: string | null; returnToDraft?: boolean }
) => {
  const definition = publishTargetDefinitions.find((item) => item.id === target);
  if (!definition) {
    throw new Error(`Unsupported publish target: ${target}`);
  }

  if (!definition.implemented || !definition.supportsUnpublish) {
    throw new Error(`Unpublish is not supported for target: ${target}`);
  }

  if (!isPublishTargetReady(target)) {
    throw new Error(`Publish target is not configured: ${target}`);
  }

  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  logWorkflow({
    level: 'info',
    message: 'post.unpublish.attempted',
    context: {
      actionId: options?.actionId ?? null,
      requestId: options?.requestId ?? null,
      slug,
      target
    },
    details: {
      targetKind: getPublishTargetKind(target),
      currentlyPublishedTargets: post.publicationSummary.livePublishedTargets,
      returnToDraft: Boolean(options?.returnToDraft)
    }
  });

  switch (target) {
    case 'github_repo':
      return unpublishGitHubRepo(post, options);
    default:
      throw new Error(`Unpublish is not implemented yet for target: ${target}`);
  }
};
