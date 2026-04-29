<script lang="ts">
  import { onMount } from 'svelte';
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
    deletedAt?: string | null;
    updatedAt: string;
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
    livePublishedTargets: string[];
    exportedTargets: string[];
    updatedAt: string;
  };

  type AppReadiness = {
    readyForGitHubSync: boolean;
  };

  const statuses: Array<PostStatus | 'all'> = [
    'all',
    'draft',
    'approved',
    'committed',
    'synced',
    'rejected'
  ];

  let bundles = $state<PostBundle[]>([]);
  let appReadiness = $state<AppReadiness | null>(null);
  let selectedStatus = $state<PostStatus | 'all'>('all');
  let selectedContentType = $state<PostRecord['contentType'] | 'all'>('all');
  let loading = $state(false);
  let syncing = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  let visibleBundles = $derived(
    bundles.filter((bundle) =>
      selectedContentType === 'all' ? true : bundle.contentTypes.includes(selectedContentType)
    )
  );

  const loadPosts = async () => {
    loading = true;
    errorMessage = '';
    try {
      const query = selectedStatus === 'all' ? '' : `?status=${selectedStatus}`;
      const data = await requestJson<{ bundles: PostBundle[] }>(apiUrl(`/api/posts${query}`));
      bundles = data.bundles;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load posts';
    } finally {
      loading = false;
    }
  };

  const loadReadiness = async () => {
    try {
      const data = await requestJson<{ readiness: AppReadiness }>(
        apiUrl('/api/settings/readiness')
      );
      appReadiness = data.readiness;
    } catch {
      appReadiness = null;
    }
  };

  const syncPosts = async () => {
    syncing = true;
    statusMessage = '';
    errorMessage = '';
    try {
      const data = await requestJson<{ synced: number }>(apiUrl('/api/posts/sync'), {
        method: 'POST'
      });
      statusMessage = `Synced ${data.synced} posts`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      syncing = false;
    }
  };

  $effect(() => {
    void loadPosts();
  });

  onMount(() => {
    void loadReadiness();
  });
</script>

<svelte:head>
  <title>Posts | Blog Agent</title>
</svelte:head>

<div class="space-y-4">
  <section class="rounded-md border border-slate-200 bg-white">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-950">Post Library</h1>
        <p class="text-sm text-slate-500">Synced posts, drafts, approvals, and rejected ideas.</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="sr-only" for="post-status-filter">Status</label>
        <select
          id="post-status-filter"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={selectedStatus}
        >
          {#each statuses as status (status)}
            <option value={status}>{status}</option>
          {/each}
        </select>
        <label class="sr-only" for="post-type-filter">Content type</label>
        <select
          id="post-type-filter"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={selectedContentType}
        >
          <option value="all">all types</option>
          <option value="blog">blog</option>
          <option value="x">x</option>
          <option value="linkedin">linkedin</option>
          <option value="generic">generic</option>
        </select>
        <button
          class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          disabled={loading}
          type="button"
          onclick={() => void loadPosts()}
        >
          Refresh
        </button>
        <button
          class="rounded-md bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={syncing || !appReadiness?.readyForGitHubSync}
          type="button"
          onclick={() => void syncPosts()}
        >
          {syncing ? 'Syncing...' : 'Sync GitHub'}
        </button>
        <a
          class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          href={resolve('/posts/deleted')}
        >
          Deleted posts
        </a>
      </div>
    </div>

    {#if statusMessage}
      <p
        class="m-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      >
        {statusMessage}
      </p>
    {/if}

    {#if errorMessage}
      <p class="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {errorMessage}
      </p>
    {/if}

    {#if loading}
      <p class="p-4 text-sm text-slate-500">Loading posts...</p>
    {:else if visibleBundles.length === 0}
      <p class="p-4 text-sm text-slate-500">No posts found.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[70rem] text-left text-sm">
          <caption class="sr-only">
            Bundled post library with content types, editorial state, publishing state, source, and
            update time.
          </caption>
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th class="px-4 py-3" scope="col">Title</th>
              <th class="px-4 py-3" scope="col">Types</th>
              <th class="px-4 py-3" scope="col">Editorial</th>
              <th class="px-4 py-3" scope="col">Published</th>
              <th class="px-4 py-3" scope="col">Source</th>
              <th class="px-4 py-3" scope="col">Updated</th>
              <th class="px-4 py-3" scope="col">Variants</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleBundles as bundle (bundle.key)}
              <tr class="border-t border-slate-100 align-top">
                <td class="px-4 py-3">
                  <a
                    class="font-medium text-slate-950 hover:underline"
                    href={resolve(`/posts/${encodeURIComponent(bundle.primaryPost.slug)}`)}
                  >
                    {bundle.primaryPost.title}
                  </a>
                  <div class="mt-1 text-xs text-slate-500">{bundle.primaryPost.slug}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1.5">
                    {#each bundle.contentTypes as contentType (contentType)}
                      <span class="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {contentType}
                      </span>
                    {/each}
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1.5">
                    {#each bundle.editorialStatuses as status (status)}
                      <span class="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {status}
                      </span>
                    {/each}
                  </div>
                </td>
                <td class="px-4 py-3">
                  {#if bundle.livePublishedTargets.length === 0}
                    <span class="text-slate-500">None</span>
                  {:else}
                    <div class="flex flex-wrap gap-1.5">
                      {#each bundle.livePublishedTargets as target (target)}
                        <span class="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                          {target}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </td>
                <td class="px-4 py-3 text-slate-700">{bundle.primaryPost.source}</td>
                <td class="px-4 py-3 text-slate-700">{formatTimestamp(bundle.updatedAt)}</td>
                <td class="px-4 py-3 text-slate-700">{bundle.posts.length}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
