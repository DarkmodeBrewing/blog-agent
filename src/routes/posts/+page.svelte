<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';
  type DesiredLength = 'short' | 'medium' | 'long';

  type PostRecord = {
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
    source: 'github' | 'generated' | 'manual';
    createdAt: string;
    updatedAt: string;
  };

  type LogEvent = {
    id: number;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
    details?: unknown;
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
  let logs = $state<LogEvent[]>([]);
  let selectedSlug = $state<string | null>(null);
  let selectedStatus = $state<PostStatus | 'all'>('all');
  let loadingPosts = $state(false);
  let syncing = $state(false);
  let generating = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  let topic = $state('');
  let summary = $state('');
  let keywords = $state('');
  let category = $state('');
  let tags = $state('');
  let desiredLength = $state<DesiredLength>('medium');
  let referencePostSlugs = $state('');

  let selectedPost = $derived(posts.find((post) => post.slug === selectedSlug) ?? posts[0] ?? null);

  const splitCsv = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const requestJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? `Request failed with ${response.status}`);
    }

    return data;
  };

  const loadPosts = async () => {
    loadingPosts = true;
    errorMessage = '';

    try {
      const query = selectedStatus === 'all' ? '' : `?status=${selectedStatus}`;
      const data = await requestJson<{ posts: PostRecord[] }>(`/api/posts${query}`);
      posts = data.posts;

      if (selectedSlug && !posts.some((post) => post.slug === selectedSlug)) {
        selectedSlug = posts[0]?.slug ?? null;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load posts';
    } finally {
      loadingPosts = false;
    }
  };

  const syncPosts = async () => {
    syncing = true;
    statusMessage = '';
    errorMessage = '';

    try {
      const data = await requestJson<{ synced: number }>('/api/posts/sync', { method: 'POST' });
      statusMessage = `Synced ${data.synced} posts`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      syncing = false;
    }
  };

  const generateDraft = async () => {
    generating = true;
    statusMessage = '';
    errorMessage = '';

    try {
      const payload = {
        topic,
        summary: summary || undefined,
        keywords: splitCsv(keywords),
        category: category || undefined,
        tags: splitCsv(tags),
        desiredLength,
        referencePostSlugs: splitCsv(referencePostSlugs)
      };
      const data = await requestJson<{ draft: { slug: string } }>(
        '/api/integrations/openai/generate',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      statusMessage = `Generated ${data.draft.slug}`;
      selectedSlug = data.draft.slug;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Draft generation failed';
    } finally {
      generating = false;
    }
  };

  const updateStatus = async (slug: string, status: PostStatus) => {
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson(`/api/posts/${encodeURIComponent(slug)}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      statusMessage = `${slug} moved to ${status}`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Status update failed';
    }
  };

  const publishPost = async (slug: string) => {
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson(`/api/posts/${encodeURIComponent(slug)}/publish`, { method: 'POST' });
      statusMessage = `${slug} published`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Publish failed';
    }
  };

  onMount(() => {
    void loadPosts();

    const events = new EventSource('/api/logs');

    events.addEventListener('log', (event) => {
      const parsed = JSON.parse(event.data) as LogEvent;
      logs = [parsed, ...logs].slice(0, 50);
    });

    return () => {
      events.close();
    };
  });

  onDestroy(() => {
    logs = [];
  });
</script>

<svelte:head>
  <title>Posts | Blog Agent</title>
</svelte:head>

<div class="space-y-6">
  <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <form
      class="space-y-4 rounded-md border border-slate-200 bg-white p-4"
      onsubmit={(event) => {
        event.preventDefault();
        void generateDraft();
      }}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold text-slate-950">Draft Generator</h1>
        <button
          class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={generating}
          type="submit"
        >
          {generating ? 'Generating...' : 'Generate draft'}
        </button>
      </div>

      <label class="block">
        <span class="text-sm font-medium text-slate-700">Topic</span>
        <input
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={topic}
          minlength="10"
          required
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium text-slate-700">Summary</span>
        <textarea
          class="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={summary}
        ></textarea>
      </label>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Length</span>
          <select
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={desiredLength}
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Category</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={category}
          />
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Keywords</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={keywords}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Tags</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={tags}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Reference Slugs</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={referencePostSlugs}
          />
        </label>
      </div>
    </form>

    <aside class="rounded-md border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-slate-950">Logs</h2>
        <button
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          type="button"
          onclick={() => (logs = [])}
        >
          Clear
        </button>
      </div>
      <div class="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
        {#if logs.length === 0}
          <p class="text-slate-500">No log events yet.</p>
        {:else}
          {#each logs as log (log.id)}
            <div class="rounded-md bg-slate-50 p-2">
              <div class="flex justify-between gap-3 text-xs text-slate-500">
                <span class="font-medium uppercase">{log.level}</span>
                <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
              </div>
              <p class="mt-1 text-slate-800">{log.message}</p>
            </div>
          {/each}
        {/if}
      </div>
    </aside>
  </section>

  {#if statusMessage}
    <p
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      {statusMessage}
    </p>
  {/if}

  {#if errorMessage}
    <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {errorMessage}
    </p>
  {/if}

  <section class="rounded-md border border-slate-200 bg-white">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">Library</h2>
        <p class="text-sm text-slate-500">{posts.length} posts</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select
          class="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={selectedStatus}
          onchange={() => void loadPosts()}
        >
          {#each statuses as status (status)}
            <option value={status}>{status}</option>
          {/each}
        </select>

        <button
          class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loadingPosts}
          type="button"
          onclick={() => void loadPosts()}
        >
          Refresh
        </button>

        <button
          class="rounded-md bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={syncing}
          type="button"
          onclick={() => void syncPosts()}
        >
          {syncing ? 'Syncing...' : 'Sync GitHub'}
        </button>
      </div>
    </div>

    <div class="grid min-h-[28rem] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div class="border-b border-slate-200 lg:border-r lg:border-b-0">
        {#if loadingPosts}
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
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-semibold text-slate-950">{selectedPost.title}</h3>
              <p class="mt-1 text-sm text-slate-500">{selectedPost.slug}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              {#if selectedPost.status === 'draft'}
                <button
                  class="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                  type="button"
                  onclick={() => void updateStatus(selectedPost.slug, 'approved')}
                >
                  Approve
                </button>
                <button
                  class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white"
                  type="button"
                  onclick={() => void updateStatus(selectedPost.slug, 'rejected')}
                >
                  Reject
                </button>
              {/if}
              {#if selectedPost.status === 'approved'}
                <button
                  class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
                  type="button"
                  onclick={() => void publishPost(selectedPost.slug)}
                >
                  Publish
                </button>
              {/if}
            </div>
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
