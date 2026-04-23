<script lang="ts">
  import { apiUrl, requestJson } from '$lib/client/request-json';

  type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';

  type PostRecord = {
    id: number;
    slug: string;
    title: string;
    ingress: string | null;
    body: string;
    tags: string[];
    status: PostStatus;
    source: 'github' | 'generated' | 'manual';
    githubPath: string | null;
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

  let posts = $state<PostRecord[]>([]);
  let appReadiness = $state<AppReadiness | null>(null);
  let selectedStatus = $state<PostStatus | 'all'>('all');
  let selectedSlug = $state<string | null>(null);
  let loading = $state(false);
  let syncing = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  let selectedPost = $derived(posts.find((post) => post.slug === selectedSlug) ?? posts[0] ?? null);

  const loadPosts = async () => {
    loading = true;
    errorMessage = '';
    try {
      const query = selectedStatus === 'all' ? '' : `?status=${selectedStatus}`;
      const data = await requestJson<{ posts: PostRecord[] }>(apiUrl(`/api/posts${query}`));
      posts = data.posts;

      if (selectedSlug && !posts.some((post) => post.slug === selectedSlug)) {
        selectedSlug = posts[0]?.slug ?? null;
      }
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
        <select
          class="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={selectedStatus}
        >
          {#each statuses as status (status)}
            <option value={status}>{status}</option>
          {/each}
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
          disabled={syncing || (appReadiness ? !appReadiness.readyForGitHubSync : false)}
          type="button"
          onclick={() => void syncPosts()}
        >
          {syncing ? 'Syncing...' : 'Sync GitHub'}
        </button>
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

    <div class="grid min-h-[34rem] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div class="border-b border-slate-200 lg:border-r lg:border-b-0">
        {#if loading}
          <p class="p-4 text-sm text-slate-500">Loading posts...</p>
        {:else if posts.length === 0}
          <p class="p-4 text-sm text-slate-500">No posts found.</p>
        {:else}
          <div class="max-h-[42rem] overflow-auto">
            {#each posts as post (post.id)}
              <button
                class={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selectedPost?.id === post.id ? 'bg-slate-100' : ''}`}
                type="button"
                onclick={() => (selectedSlug = post.slug)}
              >
                <span class="block truncate text-sm font-medium text-slate-950">{post.title}</span>
                <span class="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span class="rounded bg-slate-200 px-1.5 py-0.5">{post.status}</span>
                  <span class="truncate">{post.slug}</span>
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <article class="p-4">
        {#if selectedPost}
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold text-slate-950">{selectedPost.title}</h2>
              <p class="mt-1 text-sm text-slate-500">{selectedPost.slug}</p>
            </div>
            <span class="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {selectedPost.status}
            </span>
          </div>

          {#if selectedPost.ingress}
            <p class="mt-4 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {selectedPost.ingress}
            </p>
          {/if}

          <div class="mt-4 flex flex-wrap gap-2">
            {#each selectedPost.tags as tag (tag)}
              <span class="rounded bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800"
                >{tag}</span
              >
            {/each}
          </div>

          <pre
            class="mt-4 max-h-[32rem] overflow-auto rounded-md bg-slate-950 p-4 text-sm leading-6 whitespace-pre-wrap text-slate-100">{selectedPost.body}</pre>
        {:else}
          <p class="text-sm text-slate-500">Select a post.</p>
        {/if}
      </article>
    </div>
  </section>
</div>
