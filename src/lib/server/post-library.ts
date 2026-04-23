import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { desc, eq, sql } from 'drizzle-orm';
import { getDatabase } from './database';
import {
  contentBundles,
  generationRuns,
  postPublications,
  posts,
  postStatusEvents
} from './db/schema';
import { getGitHubBlogPostFiles, getGitHubRepoConfig } from './get-posts-from-repo';
import type { DraftRequest, GeneratedDraft, GeneratedSocialVariant } from '../../openai/model';
import { hashText, logWorkflow } from './workflow-log';

export type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';
export type PostSource = 'github' | 'generated' | 'manual';
export type PostContentType = 'blog' | 'x' | 'linkedin' | 'instagram' | 'generic';
export type PostVariantRole = 'primary' | 'derived' | 'standalone';
export type PublicationStatus = 'not_published' | 'published' | 'failed';
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
  status: PublicationStatus;
  externalId: string | null;
  remoteUrl: string | null;
  filePath: string | null;
  commitSha: string | null;
  artifact: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string;
};

export type PublicationSummary = {
  total: number;
  publishedTargets: PublishTarget[];
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

const mapPublicationRow = (row: typeof postPublications.$inferSelect): PostPublicationRecord => ({
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
  createdAt: row.createdAt,
  publishedAt: row.publishedAt,
  updatedAt: row.updatedAt
});

const listPostPublications = (postId: number) => {
  return getDatabase()
    .select()
    .from(postPublications)
    .where(eq(postPublications.postId, postId))
    .orderBy(desc(postPublications.updatedAt))
    .all()
    .map(mapPublicationRow);
};

const getPublicationSummary = (publications: PostPublicationRecord[]): PublicationSummary => {
  const published = publications.filter((publication) => publication.status === 'published');
  const failed = publications.filter((publication) => publication.status === 'failed');
  const latestPublished = [...published].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
  )[0];

  return {
    total: publications.length,
    publishedTargets: [...new Set(published.map((publication) => publication.target))],
    failedTargets: [...new Set(failed.map((publication) => publication.target))],
    latestPublishedAt: latestPublished?.publishedAt ?? null,
    latestTarget: latestPublished?.target ?? null
  };
};

const mapPostRow = (row: typeof posts.$inferSelect): PostRecord => {
  const publications = listPostPublications(row.id);
  const publicationSummary = getPublicationSummary(publications);
  const isPublished = publicationSummary.publishedTargets.length > 0;
  const isEditable = !row.lockedAt && !isPublished;

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
    lockedAt: row.lockedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publications,
    publicationSummary,
    isPublished,
    isEditable
  };
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
  const database = getDatabase();
  const rows = status
    ? database
        .select()
        .from(posts)
        .where(eq(posts.status, status))
        .orderBy(desc(posts.updatedAt))
        .all()
    : database.select().from(posts).orderBy(desc(posts.updatedAt)).all();

  return rows.map(mapPostRow);
};

export const getPostBySlug = (slug: string) => {
  const row = getDatabase().select().from(posts).where(eq(posts.slug, slug)).get();

  return row ? mapPostRow(row) : null;
};

export const getPostsByBundleId = (bundleId: number, excludeSlug?: string) => {
  const rows = getDatabase()
    .select()
    .from(posts)
    .where(eq(posts.bundleId, bundleId))
    .orderBy(desc(posts.updatedAt))
    .all();

  return rows.map(mapPostRow).filter((post) => (excludeSlug ? post.slug !== excludeSlug : true));
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
    const parentRow = getDatabase()
      .select()
      .from(posts)
      .where(eq(posts.id, post.parentPostId))
      .get();

    if (parentRow) {
      related.push(mapPostRow(parentRow));
    }
  }

  const childRows = getDatabase()
    .select()
    .from(posts)
    .where(eq(posts.parentPostId, post.id))
    .orderBy(desc(posts.updatedAt))
    .all();

  related.push(...childRows.map(mapPostRow));

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

export const createContentBundle = () => {
  const key = randomUUID();
  const result = getDatabase()
    .insert(contentBundles)
    .values({
      key
    })
    .run();

  return Number(result.lastInsertRowid);
};

export const upsertPost = (input: UpsertPostInput) => {
  const database = getDatabase();
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

  const result = database
    .insert(posts)
    .values(values)
    .onConflictDoUpdate({
      target: posts.slug,
      set: {
        bundleId: values.bundleId,
        parentPostId: values.parentPostId,
        title: values.title,
        ingress: values.ingress,
        body: values.body,
        frontmatterJson: values.frontmatterJson,
        tagsJson: values.tagsJson,
        contentType: values.contentType,
        variantRole: values.variantRole,
        status: values.status,
        githubPath: values.githubPath,
        githubSha: values.githubSha,
        source: values.source,
        lockedAt: values.lockedAt,
        updatedAt: sql`datetime('now')`
      }
    })
    .run();

  const post = getPostBySlug(input.slug);

  if (!post) {
    throw new Error(`Failed to upsert post: ${input.slug}`);
  }

  if (!existing || existing.status !== input.status) {
    database
      .insert(postStatusEvents)
      .values({
        postId: post.id,
        fromStatus: existing?.status ?? null,
        toStatus: input.status,
        notes: input.statusNotes ?? null
      })
      .run();
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
    ingress: draft.ingress,
    body: draft.body,
    frontmatter: {
      title: draft.title,
      ingress: draft.ingress,
      tags: draft.tags
    },
    tags: draft.tags,
    contentType: 'blog',
    variantRole: 'primary',
    status: 'draft',
    source: 'generated',
    statusNotes: 'Generated by OpenAI'
  });

  getDatabase()
    .insert(generationRuns)
    .values({
      postId: post.id,
      model,
      prompt,
      requestJson: JSON.stringify(request),
      responseJson: JSON.stringify(draft),
      sourcePostSlugsJson: JSON.stringify(draft.sourcePostUsed)
    })
    .run();

  logWorkflow({
    level: 'info',
    message: 'generation.draft.saved',
    details: {
      slug: post.slug,
      title: post.title,
      tags: post.tags,
      tagCount: post.tags.length,
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

  getDatabase()
    .insert(generationRuns)
    .values({
      postId: post.id,
      model,
      prompt,
      requestJson: JSON.stringify(request),
      responseJson: JSON.stringify(input.variant),
      sourcePostSlugsJson: JSON.stringify([parent.slug])
    })
    .run();

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

    const existing = getPostBySlug(slug);
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
    status: PublicationStatus;
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

  getDatabase()
    .insert(postPublications)
    .values({
      postId: post.id,
      target: input.target,
      status: input.status,
      externalId: input.externalId ?? null,
      remoteUrl: input.remoteUrl ?? null,
      filePath: input.filePath ?? null,
      commitSha: input.commitSha ?? null,
      artifactJson: input.artifact ? JSON.stringify(input.artifact) : null,
      error: input.error ?? null,
      publishedAt: input.status === 'published' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    })
    .run();

  if (input.status === 'published') {
    getDatabase()
      .update(posts)
      .set({
        lockedAt: sql`coalesce(${posts.lockedAt}, datetime('now'))`,
        updatedAt: sql`datetime('now')`
      })
      .where(eq(posts.id, post.id))
      .run();
  }

  return getPostBySlug(slug);
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
