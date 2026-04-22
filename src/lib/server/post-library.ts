import matter from 'gray-matter';
import { getDatabase } from './database';
import { getGitHubBlogPostFiles, getGitHubRepoConfig } from './get-posts-from-repo';
import type { DraftRequest, GeneratedDraft } from '../../openai/model';
import { getOctokit } from './clients';

export type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';
export type PostSource = 'github' | 'generated' | 'manual';

export type PostRecord = {
  id: number;
  slug: string;
  title: string;
  ingress: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  status: PostStatus;
  githubPath: string | null;
  githubSha: string | null;
  source: PostSource;
  createdAt: string;
  updatedAt: string;
};

type PostRow = {
  id: number;
  slug: string;
  title: string;
  ingress: string | null;
  body: string;
  frontmatter_json: string;
  tags_json: string;
  status: PostStatus;
  github_path: string | null;
  github_sha: string | null;
  source: PostSource;
  created_at: string;
  updated_at: string;
};

type UpsertPostInput = {
  slug: string;
  title: string;
  ingress?: string | null;
  body: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  status: PostStatus;
  githubPath?: string | null;
  githubSha?: string | null;
  source: PostSource;
  statusNotes?: string;
};

const mapPostRow = (row: PostRow): PostRecord => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  ingress: row.ingress,
  body: row.body,
  frontmatter: JSON.parse(row.frontmatter_json) as Record<string, unknown>,
  tags: JSON.parse(row.tags_json) as string[],
  status: row.status,
  githubPath: row.github_path,
  githubSha: row.github_sha,
  source: row.source,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

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
        .prepare<[string], PostRow>('SELECT * FROM posts WHERE status = ? ORDER BY updated_at DESC')
        .all(status)
    : database.prepare<[], PostRow>('SELECT * FROM posts ORDER BY updated_at DESC').all();

  return rows.map(mapPostRow);
};

export const getPostBySlug = (slug: string) => {
  const row = getDatabase()
    .prepare<[string], PostRow>('SELECT * FROM posts WHERE slug = ?')
    .get(slug);

  return row ? mapPostRow(row) : null;
};

export const upsertPost = (input: UpsertPostInput) => {
  const database = getDatabase();
  const existing = getPostBySlug(input.slug);

  const result = database
    .prepare<{
      slug: string;
      title: string;
      ingress: string | null;
      body: string;
      frontmatterJson: string;
      tagsJson: string;
      status: PostStatus;
      githubPath: string | null;
      githubSha: string | null;
      source: PostSource;
    }>(
      `
        INSERT INTO posts (
          slug,
          title,
          ingress,
          body,
          frontmatter_json,
          tags_json,
          status,
          github_path,
          github_sha,
          source
        )
        VALUES (
          @slug,
          @title,
          @ingress,
          @body,
          @frontmatterJson,
          @tagsJson,
          @status,
          @githubPath,
          @githubSha,
          @source
        )
        ON CONFLICT(slug) DO UPDATE SET
          title = excluded.title,
          ingress = excluded.ingress,
          body = excluded.body,
          frontmatter_json = excluded.frontmatter_json,
          tags_json = excluded.tags_json,
          status = excluded.status,
          github_path = excluded.github_path,
          github_sha = excluded.github_sha,
          source = excluded.source,
          updated_at = datetime('now')
      `
    )
    .run({
      slug: input.slug,
      title: input.title,
      ingress: input.ingress ?? null,
      body: input.body,
      frontmatterJson: JSON.stringify(input.frontmatter ?? {}),
      tagsJson: JSON.stringify(input.tags ?? []),
      status: input.status,
      githubPath: input.githubPath ?? null,
      githubSha: input.githubSha ?? null,
      source: input.source
    });

  const post = getPostBySlug(input.slug);

  if (!post) {
    throw new Error(`Failed to upsert post: ${input.slug}`);
  }

  if (!existing || existing.status !== input.status) {
    database
      .prepare<{
        postId: number;
        fromStatus: PostStatus | null;
        toStatus: PostStatus;
        notes: string | null;
      }>(
        `
          INSERT INTO post_status_events (post_id, from_status, to_status, notes)
          VALUES (@postId, @fromStatus, @toStatus, @notes)
        `
      )
      .run({
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
  const { post } = upsertPost({
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
    status: 'draft',
    source: 'generated',
    statusNotes: 'Generated by OpenAI'
  });

  getDatabase()
    .prepare<{
      postId: number;
      model: string;
      prompt: string;
      requestJson: string;
      responseJson: string;
      sourcePostSlugsJson: string;
    }>(
      `
        INSERT INTO generation_runs (
          post_id,
          model,
          prompt,
          request_json,
          response_json,
          source_post_slugs_json
        )
        VALUES (
          @postId,
          @model,
          @prompt,
          @requestJson,
          @responseJson,
          @sourcePostSlugsJson
        )
      `
    )
    .run({
      postId: post.id,
      model,
      prompt,
      requestJson: JSON.stringify(request),
      responseJson: JSON.stringify(draft),
      sourcePostSlugsJson: JSON.stringify(draft.sourcePostUsed)
    });

  return post;
};

export const updatePostStatus = (slug: string, status: PostStatus, notes?: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  return upsertPost({
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

  return upsertPost({
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
};

export const syncPostsFromGitHub = async () => {
  const files = await getGitHubBlogPostFiles();
  let synced = 0;

  for (const file of files) {
    const parsed = matter(file.content);
    const frontmatter = parsed.data;
    const slug = file.path.split('/').at(-1)?.replace(/\.md$/, '') ?? file.path;
    const title = getStringField(frontmatter, 'title') ?? slug;
    const ingress =
      getStringField(frontmatter, 'ingress') ?? getStringField(frontmatter, 'description') ?? null;
    const tags = getStringArrayField(frontmatter, 'tags');

    upsertPost({
      slug,
      title,
      ingress,
      body: parsed.content.trim(),
      frontmatter,
      tags,
      status: 'synced',
      githubPath: file.path,
      githubSha: file.sha,
      source: 'github',
      statusNotes: 'Synced from GitHub'
    });

    synced += 1;
  }

  return {
    synced
  };
};

export const publishApprovedDraft = async (slug: string) => {
  const post = getPostBySlug(slug);

  if (!post) {
    return null;
  }

  if (post.status !== 'approved') {
    throw new Error(`Post must be approved before publishing. Current status: ${post.status}`);
  }

  const octokit = getOctokit();
  const config = getGitHubRepoConfig();
  const path = post.githubPath ?? `${config.blogPostPath}/${post.slug}.md`;
  const content = matter.stringify(post.body, {
    ...post.frontmatter,
    title: post.title,
    ingress: post.ingress ?? undefined,
    tags: post.tags
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
    content: Buffer.from(content).toString('base64'),
    sha: currentSha
  });

  return upsertPost({
    slug: post.slug,
    title: post.title,
    ingress: post.ingress,
    body: post.body,
    frontmatter: post.frontmatter,
    tags: post.tags,
    status: 'committed',
    githubPath: path,
    githubSha: result.data.content?.sha ?? currentSha ?? null,
    source: 'github',
    statusNotes: 'Published to GitHub'
  }).post;
};
