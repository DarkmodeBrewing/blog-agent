<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { apiUrl, requestJson } from '$lib/client/request-json';
  import { formatTimestamp } from '$lib/time';

  type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';

  type PostRecord = {
    id: number;
    bundleId: number | null;
    slug: string;
    title: string;
    ingress: string | null;
    body: string;
    tags: string[];
    status: PostStatus;
    contentType: 'blog' | 'x' | 'linkedin' | 'instagram' | 'generic';
    variantRole: 'primary' | 'derived' | 'standalone';
    source: 'github' | 'generated' | 'manual';
    githubPath: string | null;
    lockedAt: string | null;
    deletedAt: string | null;
    updatedAt: string;
    publications: Array<{
      id: number;
      target: string;
      status: 'not_published' | 'published' | 'unpublished' | 'failed';
      remoteUrl: string | null;
      filePath: string | null;
      commitSha: string | null;
      error: string | null;
      publishedAt: string | null;
      unpublishedAt: string | null;
      updatedAt: string;
    }>;
    publicationSummary: {
      total: number;
      publishedTargets: string[];
      livePublishedTargets: string[];
      exportedTargets: string[];
      failedTargets: string[];
      latestPublishedAt: string | null;
      latestTarget: string | null;
    };
    isPublished: boolean;
    isEditable: boolean;
  };

  type PostBundle = {
    key: string;
    bundleId: number | null;
    primaryPost: PostRecord;
    posts: PostRecord[];
    contentTypes: Array<PostRecord['contentType']>;
    editorialStatuses: PostStatus[];
    publishedTargets: string[];
    updatedAt: string;
  };

  type PostDetailResponse = {
    post: PostRecord;
    relatedPosts: PostRecord[];
    bundle: PostBundle | null;
  };

  let detail = $state<PostDetailResponse | null>(null);
  let selectedSlug = $state('');
  let loading = $state(false);
  let mutating = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  let currentPost = $derived(
    detail?.bundle?.posts.find((post) => post.slug === selectedSlug) ?? detail?.post ?? null
  );
  let bundlePosts = $derived(detail?.bundle?.posts ?? (detail?.post ? [detail.post] : []));
  let currentLockTargets = $derived(currentPost?.publicationSummary.livePublishedTargets ?? []);
  let canDeleteCurrentPost = $derived(
    Boolean(
      currentPost &&
      currentPost.publicationSummary.livePublishedTargets.length === 0 &&
      (currentPost.status === 'draft' || currentPost.status === 'rejected')
    )
  );

  const canUnpublishTarget = (target: string) => target === 'github_repo';

  const getTargetLabel = (target: string) => (target === 'github_repo' ? 'GitHub' : target);

  const loadPost = async (options?: { preserveStatusMessage?: boolean }) => {
    const routeSlug = page.params.slug;
    if (!routeSlug) return;

    loading = true;
    if (!options?.preserveStatusMessage) {
      statusMessage = '';
    }
    errorMessage = '';

    try {
      const data = await requestJson<PostDetailResponse>(
        apiUrl(`/api/posts/${encodeURIComponent(routeSlug)}`)
      );
      detail = data;
      selectedSlug = data.post.slug;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load post';
      detail = null;
    } finally {
      loading = false;
    }
  };

  const unpublishCurrentPost = async (target: string, returnToDraft = false) => {
    if (!currentPost) return;

    mutating = true;
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson<{ result: { post: PostRecord } }>(
        apiUrl(
          `/api/posts/${encodeURIComponent(currentPost.slug)}/unpublish/${encodeURIComponent(target)}`
        ),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ returnToDraft })
        }
      );

      statusMessage = returnToDraft
        ? `Unpublished ${target} and returned post to draft`
        : `Unpublished ${target}`;
      await loadPost({ preserveStatusMessage: true });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to unpublish post';
    } finally {
      mutating = false;
    }
  };

  const deleteCurrentPost = async () => {
    if (!currentPost) return;
    if (!confirm(`Move "${currentPost.title}" to deleted posts?`)) return;

    mutating = true;
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson<{ deleted: boolean }>(
        apiUrl(`/api/posts/${encodeURIComponent(currentPost.slug)}`),
        {
          method: 'DELETE'
        }
      );
      window.location.href = resolve('/posts');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to delete post';
      mutating = false;
    }
  };

  $effect(() => {
    void loadPost();
  });
</script>

<svelte:head>
  <title>{detail?.post.title ? `${detail.post.title} | Posts` : 'Post detail | Blog Agent'}</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="space-y-1">
      <a class="text-sm font-medium text-slate-600 hover:underline" href={resolve('/posts')}>
        Back to posts
      </a>
      <h1 class="text-2xl font-semibold text-slate-950">
        {detail?.bundle?.primaryPost.title ?? detail?.post.title ?? 'Post detail'}
      </h1>
    </div>

    {#if currentPost}
      <div class="flex flex-wrap gap-2">
        {#if currentPost.isEditable}
          <a
            class="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            href={resolve(`/drafts?slug=${encodeURIComponent(currentPost.slug)}`)}
          >
            Edit
          </a>
        {:else}
          <a
            class="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            href={resolve(`/drafts?copy=${encodeURIComponent(currentPost.slug)}`)}
          >
            Create copy
          </a>
        {/if}
        {#if currentPost.publicationSummary.livePublishedTargets.length > 0}
          {#each currentPost.publicationSummary.livePublishedTargets as target (target)}
            {#if canUnpublishTarget(target)}
              <button
                class="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                disabled={mutating}
                type="button"
                onclick={() => void unpublishCurrentPost(target)}
              >
                Unpublish {getTargetLabel(target)}
              </button>
            {/if}
          {/each}
          {#if currentPost.publicationSummary.livePublishedTargets.includes('github_repo')}
            <button
              class="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              disabled={mutating}
              type="button"
              onclick={() => void unpublishCurrentPost('github_repo', true)}
            >
              Unpublish and return to draft
            </button>
          {/if}
        {/if}
        {#if canDeleteCurrentPost}
          <button
            class="inline-flex rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            disabled={mutating}
            type="button"
            onclick={() => void deleteCurrentPost()}
          >
            Move to deleted
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if errorMessage}
    <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {errorMessage}
    </p>
  {/if}

  {#if statusMessage}
    <p
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      {statusMessage}
    </p>
  {/if}

  {#if loading}
    <section class="rounded-md border border-slate-200 bg-white p-4">
      <p class="text-sm text-slate-500">Loading post...</p>
    </section>
  {:else if currentPost}
    <div class="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside class="space-y-4">
        <section class="rounded-md border border-slate-200 bg-white p-4">
          <h2 class="text-sm font-semibold text-slate-950">Variants</h2>
          <div class="mt-3 space-y-2">
            {#each bundlePosts as post (post.id)}
              <button
                aria-pressed={post.slug === currentPost.slug}
                class={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                  post.slug === currentPost.slug
                    ? 'border-slate-900 bg-slate-100 text-slate-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                type="button"
                onclick={() => (selectedSlug = post.slug)}
              >
                <span class="block font-medium">{post.title}</span>
                <span class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{post.contentType}</span>
                  <span>{post.variantRole}</span>
                  <span>{post.status}</span>
                </span>
              </button>
            {/each}
          </div>
        </section>

        <section class="rounded-md border border-slate-200 bg-white p-4">
          <h2 class="text-sm font-semibold text-slate-950">Metadata</h2>
          <dl class="mt-3 space-y-3 text-sm">
            <div>
              <dt class="text-slate-500">Slug</dt>
              <dd class="text-slate-900">{currentPost.slug}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Source</dt>
              <dd class="text-slate-900">{currentPost.source}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Updated</dt>
              <dd class="text-slate-900">{formatTimestamp(currentPost.updatedAt)}</dd>
            </div>
          </dl>
        </section>
      </aside>

      <article class="space-y-4 rounded-md border border-slate-200 bg-white p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-2xl font-semibold text-slate-950">{currentPost.title}</h2>
            {#if currentPost.ingress}
              <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{currentPost.ingress}</p>
            {/if}
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="rounded bg-slate-100 px-2 py-1 text-slate-700">{currentPost.status}</span>
            <span class="rounded bg-slate-100 px-2 py-1 text-slate-700">
              {currentPost.contentType}
            </span>
            <span class="rounded bg-slate-100 px-2 py-1 text-slate-700">
              {currentPost.variantRole}
            </span>
          </div>
        </div>

        {#if currentPost.isPublished}
          <p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This post is locked because it has active live publications on
            {currentLockTargets.join(', ')}. Create a copy to continue editing.
          </p>
        {/if}

        {#if currentPost.publicationSummary.publishedTargets.length > 0}
          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-slate-950">Current target state</h3>
            <div class="flex flex-wrap gap-2">
              {#each currentPost.publicationSummary.livePublishedTargets as target (target)}
                <span class="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                  Live: {target}
                </span>
              {/each}
              {#each currentPost.publicationSummary.exportedTargets as target (target)}
                <span class="rounded bg-cyan-50 px-2 py-1 text-xs text-cyan-800">
                  Exported: {target}
                </span>
              {/each}
            </div>
          </section>
        {/if}

        {#if currentPost.publications.length > 0}
          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-slate-950">Publication history</h3>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[42rem] text-left text-sm">
                <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th class="px-3 py-2" scope="col">Target</th>
                    <th class="px-3 py-2" scope="col">Status</th>
                    <th class="px-3 py-2" scope="col">Published</th>
                    <th class="px-3 py-2" scope="col">Unpublished</th>
                    <th class="px-3 py-2" scope="col">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {#each currentPost.publications as publication (publication.id)}
                    <tr class="border-t border-slate-100">
                      <td class="px-3 py-2 text-slate-700">{publication.target}</td>
                      <td class="px-3 py-2 text-slate-700">{publication.status}</td>
                      <td class="px-3 py-2 text-slate-700">
                        {publication.publishedAt ? formatTimestamp(publication.publishedAt) : '—'}
                      </td>
                      <td class="px-3 py-2 text-slate-700">
                        {publication.unpublishedAt
                          ? formatTimestamp(publication.unpublishedAt)
                          : '—'}
                      </td>
                      <td class="px-3 py-2 text-slate-700">
                        {publication.remoteUrl ??
                          publication.filePath ??
                          publication.commitSha ??
                          '—'}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {/if}

        {#if currentPost.tags.length > 0}
          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-slate-950">Tags</h3>
            <div class="flex flex-wrap gap-2">
              {#each currentPost.tags as tag (tag)}
                <span class="rounded bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800">
                  {tag}
                </span>
              {/each}
            </div>
          </section>
        {/if}

        <section class="space-y-2">
          <h3 class="text-sm font-semibold text-slate-950">Preview</h3>
          <div
            class="rounded-md bg-slate-950 p-4 text-sm leading-6 whitespace-pre-wrap text-slate-100"
          >
            {currentPost.body}
          </div>
        </section>
      </article>
    </div>
  {/if}
</div>
