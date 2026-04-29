import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { getGitHubBlogPostFiles, getGitHubRepoConfig } from './get-posts-from-repo';
import type { DraftRequest, GeneratedDraft, GeneratedSocialVariant } from '../../openai/model';
import { hashText, logWorkflow } from './workflow-log';
import {
  insertContentBundle,
  insertGenerationRun,
  insertPostStatusEvent,
  selectChildPostRows,
  selectPublicationRowsForPost,
  selectPublicationRowsForPosts,
  selectPostRowById,
  selectPostRowBySlug,
  selectPostRows,
  selectPostRowsByBundleId,
  deletePostById,
  upsertPostRow,
  type PostPublicationRow,
  type PostRow
} from './repositories/content-repository';
import {
  insertPublicationRecord,
  lockPublishedPostById,
  unlockPublishedPostById
} from './repositories/publishing-repository';
import { isLivePublicationTarget } from './publication-targets';
import { selectSyncedPostRowBySlug } from './repositories/sync-repository';

export type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';
export type PostSource = 'github' | 'generated' | 'manual';
export type PostContentType = 'blog' | 'x' | 'linkedin' | 'instagram' | 'generic';
export type PostVariantRole = 'primary' | 'derived' | 'standalone';
export type PublicationStatus = 'not_published' | 'published' | 'failed';
export type PublicationLifecycleStatus = PublicationStatus | 'unpublished';
export type PublishTarget =
  | 'markdown_download'
  | 'markdown_disk_export'
  | 'github_repo'
  | 'cms_contentful'
  | 'social_x'
  | 'social_linkedin';

export type PostPublicationRecord = {
  id: number;
  postId: number;
  target: PublishTarget;
  status: PublicationLifecycleStatus;
  externalId: string | null;
  remoteUrl: string | null;
  filePath: string | null;
  commitSha: string | null;
  artifact: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  publishedAt: string | null;
  unpublishedAt: string | null;
  updatedAt: string;
};

export type PublicationSummary = {
  total: number;
  publishedTargets: PublishTarget[];
  livePublishedTargets: PublishTarget[];
  exportedTargets: PublishTarget[];
  failedTargets: PublishTarget[];
  latestPublishedAt: string | null;
  latestTarget: PublishTarget | null;
};

export type PostRecord = {
  id: number;
  bundleId: number | null;
  parentPostId: number | null;
  slug: string;
  title: string;
  ingress: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  contentType: PostContentType;
  variantRole: PostVariantRole;
  status: PostStatus;
  githubPath: string | null;
  githubSha: string | null;
  source: PostSource;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publications: PostPublicationRecord[];
  publicationSummary: PublicationSummary;
  isPublished: boolean;
  isEditable: boolean;
};

export type PostBundleRecord = {
  key: string;
  bundleId: number | null;
  primaryPost: PostRecord;
  posts: PostRecord[];
  contentTypes: PostContentType[];
  editorialStatuses: PostStatus[];
  publishedTargets: PublishTarget[];
  updatedAt: string;
};

type UpsertPostInput = {
  bundleId?: number | null;
  parentPostId?: number | null;
  slug: string;
  title: string;
  ingress?: string | null;
  body: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  contentType?: PostContentType;
  variantRole?: PostVariantRole;
  status: PostStatus;
  githubPath?: string | null;
  githubSha?: string | null;
  source: PostSource;
  lockedAt?: string | null;
  statusNotes?: string;
};

const normalizeTimestamp = (value: string | null) => {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
};

const mapPublicationRow = (row: PostPublicationRow): PostPublicationRecord => ({
  id: row.id,
  postId: row.postId,
  target: row.target,
  status: row.status,
  externalId: row.externalId,
  remoteUrl: row.remoteUrl,
  filePath: row.filePath,
  commitSha: row.commitSha,
  artifact: row.artifactJson ? (JSON.parse(row.artifactJson) as Record<string, unknown>) : null,
  error: row.error,
  createdAt: normalizeTimestamp(row.createdAt) ?? row.createdAt,
  publishedAt: normalizeTimestamp(row.publishedAt),
  unpublishedAt: normalizeTimestamp(row.unpublishedAt),
  updatedAt: normalizeTimestamp(row.updatedAt) ?? row.updatedAt
});

const listPostPublications = (postId: number) => {
  return selectPublicationRowsForPost(postId).map(mapPublicationRow);
};

const mapPublicationRowsByPostId = (rows: PostRow[]) => {
  const publicationsByPostId = new Map<number, PostPublicationRecord[]>();

  for (const publication of selectPublicationRowsForPosts(rows.map((row) => row.id)).map(
    mapPublicationRow
  )) {
    const existing = publicationsByPostId.get(publication.postId);

    if (existing) {
      existing.push(publication);
    } else {
      publicationsByPostId.set(publication.postId, [publication]);
    }
  }

  return publicationsByPostId;
};

const getPublicationSummary = (
  publications: PostPublicationRecord[],
  post?: Pick<PostRow, 'source' | 'githubPath' | 'status'>
): PublicationSummary => {
  const latestByTarget = new Map<PublishTarget, PostPublicationRecord>();

  for (const publication of publications) {
    if (!latestByTarget.has(publication.target)) {
      latestByTarget.set(publication.target, publication);
    }
  }

  const currentPublications = [...latestByTarget.values()];
  const published = currentPublications.filter((publication) => publication.status === 'published');
  const failed = currentPublications.filter((publication) => publication.status === 'failed');
  const latestPublished = [...published].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
  )[0];
  const implicitGitHubPublished =
    post?.source === 'github' && post.status === 'synced' && Boolean(post.githubPath);
  const publishedTargets = [...new Set(published.map((publication) => publication.target))];
  const livePublishedTargets = publishedTargets.filter((target) => isLivePublicationTarget(target));
  const exportedTargets = publishedTargets.filter((target) => !isLivePublicationTarget(target));

  if (implicitGitHubPublished) {
    publishedTargets.unshift('github_repo');
    livePublishedTargets.unshift('github_repo');
  }

  return {
    total: publications.length,
    publishedTargets: [...new Set(publishedTargets)],
    livePublishedTargets: [...new Set(livePublishedTargets)],
    exportedTargets: [...new Set(exportedTargets)],
    failedTargets: [...new Set(failed.map((publication) => publication.target))],
    latestPublishedAt: latestPublished?.publishedAt ?? null,
    latestTarget: latestPublished?.target ?? (implicitGitHubPublished ? 'github_repo' : null)
  };
};

const mapPostRow = (
  row: PostRow,
  publicationsByPostId?: Map<number, PostPublicationRecord[]>
): PostRecord => {
  const publications = publicationsByPostId?.get(row.id) ?? listPostPublications(row.id);
  const publicationSummary = getPublicationSummary(publications, row);
  const isPublished = publicationSummary.livePublishedTargets.length > 0;
  const isEditable = !isPublished;

  return {
    id: row.id,
    bundleId: row.bundleId,
    parentPostId: row.parentPostId,
    slug: row.slug,
    title: row.title,
    ingress: row.ingress,
    body: row.body,
    frontmatter: JSON.parse(row.frontmatterJson) as Record<string, unknown>,
    tags: JSON.parse(row.tagsJson) as string[],
    contentType: row.contentType,
    variantRole: row.variantRole,
    status: row.status,
    githubPath: row.githubPath,
    githubSha: row.githubSha,
    source: row.source,
    lockedAt: normalizeTimestamp(row.lockedAt),
    createdAt: normalizeTimestamp(row.createdAt) ?? row.createdAt,
    updatedAt: normalizeTimestamp(row.updatedAt) ?? row.updatedAt,
    publications,
    publicationSummary,
    isPublished,
    isEditable
  };
};

const mapPostRows = (rows: PostRow[]) => {
  const publicationsByPostId = mapPublicationRowsByPostId(rows);
  return rows.map((row) => mapPostRow(row, publicationsByPostId));
};

const getStringField = (data: Record<string, unknown>, key: string) => {
  const value = data[key];

  return typeof value === 'string' ? value : undefined;
};

const getStringArrayField = (data: Record<string, unknown>, key: string) => {
  const value = data[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

export const listPosts = (status?: PostStatus) => {
  return mapPostRows(selectPostRows(status));
};

export const getPostBySlug = (slug: string) => {
  const row = selectPostRowBySlug(slug);

  return row ? mapPostRow(row) : null;
};

export const getPostsByBundleId = (bundleId: number, excludeSlug?: string) => {
  const rows = selectPostRowsByBundleId(bundleId);

  return mapPostRows(rows).filter((post) => (excludeSlug ? post.slug !== excludeSlug : true));
};

export const getRelatedPosts = (slug: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return [];
  }

  if (post.bundleId) {
    return getPostsByBundleId(post.bundleId, post.slug);
  }

  const related: PostRecord[] = [];

  if (post.parentPostId) {
    const parentRow = selectPostRowById(post.parentPostId);

    if (parentRow) {
      related.push(mapPostRow(parentRow));
    }
  }

  const childRows = selectChildPostRows(post.id);

  related.push(...mapPostRows(childRows));

  return related.filter((relatedPost, index, collection) => {
    return (
      relatedPost.slug !== post.slug &&
      collection.findIndex((candidate) => candidate.slug === relatedPost.slug) === index
    );
  });
};

export const getBundlePostsForSlug = (slug: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return [];
  }

  const bundlePosts = post.bundleId
    ? [post, ...getPostsByBundleId(post.bundleId, post.slug)]
    : [post, ...getRelatedPosts(slug)];

  return bundlePosts.sort((a, b) => {
    if (a.contentType === 'blog' && b.contentType !== 'blog') return -1;
    if (b.contentType === 'blog' && a.contentType !== 'blog') return 1;
    if (a.variantRole === 'primary' && b.variantRole !== 'primary') return -1;
    if (b.variantRole === 'primary' && a.variantRole !== 'primary') return 1;

    return b.updatedAt.localeCompare(a.updatedAt);
  });
};

const toBundleKey = (post: PostRecord) =>
  post.bundleId ? `bundle:${post.bundleId}` : `post:${post.slug}`;

const mapBundlePosts = (bundlePosts: PostRecord[]): PostBundleRecord => {
  const sorted = [...bundlePosts].sort((a, b) => {
    if (a.contentType === 'blog' && b.contentType !== 'blog') return -1;
    if (b.contentType === 'blog' && a.contentType !== 'blog') return 1;
    if (a.variantRole === 'primary' && b.variantRole !== 'primary') return -1;
    if (b.variantRole === 'primary' && a.variantRole !== 'primary') return 1;

    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const primaryPost = sorted[0];

  return {
    key: toBundleKey(primaryPost),
    bundleId: primaryPost.bundleId,
    primaryPost,
    posts: sorted,
    contentTypes: [...new Set(sorted.map((post) => post.contentType))],
    editorialStatuses: [...new Set(sorted.map((post) => post.status))],
    publishedTargets: [
      ...new Set(sorted.flatMap((post) => post.publicationSummary.publishedTargets))
    ],
    updatedAt: sorted.reduce(
      (latest, post) => (post.updatedAt > latest ? post.updatedAt : latest),
      primaryPost.updatedAt
    )
  };
};

export const listPostBundles = (status?: PostStatus) => {
  const grouped = new Map<string, PostRecord[]>();

  for (const post of listPosts(status)) {
    const key = toBundleKey(post);
    const existing = grouped.get(key);

    if (existing) {
      existing.push(post);
    } else {
      grouped.set(key, [post]);
    }
  }

  return [...grouped.values()]
    .map(mapBundlePosts)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const getPostBundleBySlug = (slug: string) => {
  const bundlePosts = getBundlePostsForSlug(slug);

  if (bundlePosts.length === 0) {
    return null;
  }

  return mapBundlePosts(bundlePosts);
};

export const createContentBundle = () => {
  const key = randomUUID();
  return insertContentBundle(key);
};

export const upsertPost = (input: UpsertPostInput) => {
  const existing = getPostBySlug(input.slug);

  const values = {
    bundleId: input.bundleId ?? existing?.bundleId ?? null,
    parentPostId: input.parentPostId ?? existing?.parentPostId ?? null,
    slug: input.slug,
    title: input.title,
    ingress: input.ingress ?? null,
    body: input.body,
    frontmatterJson: JSON.stringify(input.frontmatter ?? {}),
    tagsJson: JSON.stringify(input.tags ?? []),
    contentType: input.contentType ?? existing?.contentType ?? 'blog',
    variantRole: input.variantRole ?? existing?.variantRole ?? 'standalone',
    status: input.status,
    githubPath: input.githubPath ?? null,
    githubSha: input.githubSha ?? null,
    source: input.source,
    lockedAt: input.lockedAt ?? existing?.lockedAt ?? null
  };

  const result = upsertPostRow(values);

  const post = getPostBySlug(input.slug);

  if (!post) {
    throw new Error(`Failed to upsert post: ${input.slug}`);
  }

  if (!existing || existing.status !== input.status) {
    insertPostStatusEvent({
      postId: post.id,
      fromStatus: existing?.status ?? null,
      toStatus: input.status,
      notes: input.statusNotes ?? null
    });
  }

  return {
    post,
    changed: result.changes > 0
  };
};

export const createDraftFromGeneration = (
  draft: GeneratedDraft,
  request: DraftRequest,
  model: string,
  prompt: string
) => {
  const bundleId = createContentBundle();
  const { post } = upsertPost({
    bundleId,
    slug: draft.slug,
    title: draft.title,
    ingress: draft.ingress ?? null,
    body: draft.body,
    frontmatter: {
      title: draft.title,
      ...(draft.ingress ? { ingress: draft.ingress } : {}),
      ...((draft.category ?? request.category)
        ? { category: draft.category ?? request.category }
        : {}),
      ...(draft.tags ? { tags: draft.tags } : {})
    },
    tags: draft.tags ?? [],
    contentType: 'blog',
    variantRole: 'primary',
    status: 'draft',
    source: 'generated',
    statusNotes: 'Generated by OpenAI'
  });

  insertGenerationRun({
    postId: post.id,
    model,
    prompt,
    requestJson: JSON.stringify(request),
    responseJson: JSON.stringify(draft),
    sourcePostSlugsJson: JSON.stringify(draft.sourcePostUsed)
  });

  logWorkflow({
    level: 'info',
    message: 'generation.draft.saved',
    details: {
      slug: post.slug,
      title: post.title,
      tags: post.tags,
      tagCount: post.tags.length,
      hasIngress: Boolean(post.ingress),
      category: post.frontmatter.category ?? null,
      bodyLength: post.body.length,
      model,
      promptLength: prompt.length,
      promptHash: hashText(prompt),
      sourcePostUsed: draft.sourcePostUsed
    }
  });

  return post;
};

export const createVariantDraftFromGeneration = (
  input: {
    parentSlug: string;
    variant: GeneratedSocialVariant;
    body: string;
  },
  request: DraftRequest,
  model: string,
  prompt: string
) => {
  const parent = getPostBySlug(input.parentSlug);

  if (!parent) {
    throw new Error(`Parent draft not found: ${input.parentSlug}`);
  }

  const slugBase = `${parent.slug}-${input.variant.platform}`;
  let slug = slugBase;
  let counter = 2;

  while (getPostBySlug(slug)) {
    slug = `${slugBase}-${counter}`;
    counter += 1;
  }

  const titleSuffix = input.variant.platform === 'x' ? 'X Post' : 'LinkedIn Post';
  const { post } = upsertPost({
    bundleId: parent.bundleId,
    parentPostId: parent.id,
    slug,
    title: `${parent.title} (${titleSuffix})`,
    ingress: parent.ingress,
    body: input.body,
    frontmatter: {},
    tags: parent.tags,
    contentType: input.variant.platform,
    variantRole: 'derived',
    status: 'draft',
    source: 'generated',
    statusNotes: `Derived ${input.variant.platform} variant generated from ${parent.slug}`
  });

  insertGenerationRun({
    postId: post.id,
    model,
    prompt,
    requestJson: JSON.stringify(request),
    responseJson: JSON.stringify(input.variant),
    sourcePostSlugsJson: JSON.stringify([parent.slug])
  });

  logWorkflow({
    level: 'info',
    message: 'generation.variant.saved',
    details: {
      slug: post.slug,
      parentSlug: parent.slug,
      platform: input.variant.platform,
      bodyLength: input.body.length,
      model,
      promptLength: prompt.length,
      promptHash: hashText(prompt)
    }
  });

  return post;
};

export const updatePostStatus = (slug: string, status: PostStatus, notes?: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  if (!post.isEditable) {
    throw new Error('Published posts are locked. Create a copy to continue editing.');
  }

  const updatedPost = upsertPost({
    slug: post.slug,
    title: post.title,
    ingress: post.ingress,
    body: post.body,
    frontmatter: post.frontmatter,
    tags: post.tags,
    status,
    githubPath: post.githubPath,
    githubSha: post.githubSha,
    source: post.source,
    statusNotes: notes
  }).post;

  logWorkflow({
    level: 'info',
    message: 'post.status.changed',
    details: {
      slug,
      fromStatus: post.status,
      toStatus: status,
      hasNotes: Boolean(notes)
    }
  });

  return updatedPost;
};

export const updatePostContent = (
  slug: string,
  input: {
    title: string;
    ingress?: string | null;
    body: string;
    tags?: string[];
  }
) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  if (!post.isEditable) {
    throw new Error('Published posts are locked. Create a copy to continue editing.');
  }

  const updatedPost = upsertPost({
    slug: post.slug,
    title: input.title,
    ingress: input.ingress ?? null,
    body: input.body,
    frontmatter: {
      ...post.frontmatter,
      title: input.title,
      ingress: input.ingress ?? undefined,
      tags: input.tags ?? post.tags
    },
    tags: input.tags ?? post.tags,
    status: post.status,
    githubPath: post.githubPath,
    githubSha: post.githubSha,
    source: post.source
  }).post;

  const changedFields = [
    post.title !== input.title ? 'title' : null,
    (post.ingress ?? null) !== (input.ingress ?? null) ? 'ingress' : null,
    post.body !== input.body ? 'body' : null,
    JSON.stringify(post.tags) !== JSON.stringify(input.tags ?? post.tags) ? 'tags' : null
  ].filter((field): field is string => Boolean(field));

  logWorkflow({
    level: 'info',
    message: 'post.edited',
    details: {
      slug,
      changedFields,
      previousBodyLength: post.body.length,
      newBodyLength: input.body.length,
      bodyLengthDelta: input.body.length - post.body.length,
      locked: Boolean(post.lockedAt)
    }
  });

  return updatedPost;
};

export const syncPostsFromGitHub = async () => {
  const config = getGitHubRepoConfig();
  logWorkflow({
    level: 'info',
    message: 'sync.started',
    details: {
      owner: config.owner,
      repo: config.repo,
      path: config.blogPostPath,
      ref: config.ref
    }
  });

  const files = await getGitHubBlogPostFiles();
  let synced = 0;
  let inserted = 0;
  let updated = 0;

  for (const file of files) {
    const parsed = matter(file.content);
    const frontmatter = parsed.data;
    const slug = file.path.split('/').at(-1)?.replace(/\.md$/, '') ?? file.path;
    const title = getStringField(frontmatter, 'title') ?? slug;
    const ingress =
      getStringField(frontmatter, 'ingress') ?? getStringField(frontmatter, 'description') ?? null;
    const tags = getStringArrayField(frontmatter, 'tags');

    logWorkflow({
      level: 'debug',
      message: 'sync.file.parsed',
      details: {
        path: file.path,
        slug,
        title,
        tagCount: tags.length,
        bodyLength: parsed.content.trim().length
      }
    });

    const existing = selectSyncedPostRowBySlug(slug);
    const { changed } = upsertPost({
      slug,
      title,
      ingress,
      body: parsed.content.trim(),
      frontmatter,
      tags,
      contentType: 'blog',
      variantRole: 'standalone',
      status: 'synced',
      githubPath: file.path,
      githubSha: file.sha,
      source: 'github',
      statusNotes: 'Synced from GitHub'
    });

    if (!existing) {
      inserted += 1;
    } else if (changed) {
      updated += 1;
    }

    logWorkflow({
      level: 'debug',
      message: 'sync.post.upserted',
      details: {
        slug,
        status: 'synced',
        source: 'github',
        changed,
        operation: existing ? 'updated' : 'inserted'
      }
    });

    synced += 1;
  }

  logWorkflow({
    level: 'info',
    message: 'sync.completed',
    details: {
      discovered: files.length,
      synced,
      inserted,
      updated,
      skipped: files.length - synced
    }
  });

  return {
    synced
  };
};

export const recordPostPublication = (
  slug: string,
  input: {
    target: PublishTarget;
    status: PublicationLifecycleStatus;
    externalId?: string | null;
    remoteUrl?: string | null;
    filePath?: string | null;
    commitSha?: string | null;
    artifact?: Record<string, unknown> | null;
    error?: string | null;
  }
) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  insertPublicationRecord({
    postId: post.id,
    target: input.target,
    status: input.status,
    externalId: input.externalId ?? null,
    remoteUrl: input.remoteUrl ?? null,
    filePath: input.filePath ?? null,
    commitSha: input.commitSha ?? null,
    artifactJson: input.artifact ? JSON.stringify(input.artifact) : null,
    error: input.error ?? null,
    unpublishedAt:
      input.status === 'unpublished'
        ? new Date().toISOString().slice(0, 19).replace('T', ' ')
        : null
  });

  if (input.status === 'published') {
    if (isLivePublicationTarget(input.target)) {
      lockPublishedPostById(post.id);
    }
  } else {
    const refreshedPost = getPostBySlug(slug);

    if (refreshedPost && refreshedPost.publicationSummary.livePublishedTargets.length === 0) {
      unlockPublishedPostById(post.id);
    }
  }

  return getPostBySlug(slug);
};

export const getLatestPublicationForTarget = (slug: string, target: PublishTarget) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  return post.publications.find((publication) => publication.target === target) ?? null;
};

export const createEditableCopy = (slug: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  const copySlugBase = `${post.slug}-copy`;
  let nextSlug = copySlugBase;
  let counter = 2;

  while (getPostBySlug(nextSlug)) {
    nextSlug = `${copySlugBase}-${counter}`;
    counter += 1;
  }

  const copy = upsertPost({
    bundleId: post.bundleId,
    parentPostId: post.id,
    slug: nextSlug,
    title: `${post.title} (Copy)`,
    ingress: post.ingress,
    body: post.body,
    frontmatter: post.frontmatter,
    tags: post.tags,
    contentType: post.contentType,
    variantRole: post.variantRole === 'primary' ? 'derived' : post.variantRole,
    status: 'draft',
    source: 'manual',
    lockedAt: null,
    statusNotes: `Created editable copy from ${post.slug}`
  }).post;

  logWorkflow({
    level: 'info',
    message: 'post.copy.created',
    details: {
      sourceSlug: post.slug,
      copySlug: copy.slug,
      sourcePostId: post.id,
      copyPostId: copy.id
    }
  });

  return copy;
};

export const deletePost = (slug: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  if (post.publicationSummary.livePublishedTargets.length > 0) {
    throw new Error('Published posts must be unpublished before they can be deleted.');
  }

  if (!['draft', 'rejected'].includes(post.status)) {
    throw new Error(`Only draft or rejected posts can be deleted. Current status: ${post.status}`);
  }

  deletePostById(post.id);

  logWorkflow({
    level: 'info',
    message: 'post.deleted',
    details: {
      slug,
      postId: post.id,
      status: post.status,
      source: post.source,
      contentType: post.contentType
    }
  });

  return {
    slug,
    deleted: true
  };
};
