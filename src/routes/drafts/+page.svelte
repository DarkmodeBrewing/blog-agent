<script lang="ts">
  import { apiUrl, requestJson } from '$lib/client/request-json';
  import { onDestroy, onMount } from 'svelte';

  type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';
  type DesiredLength = 'short' | 'medium' | 'long';

  type PostRecord = {
    id: number;
    slug: string;
    title: string;
    ingress: string | null;
    body: string;
    tags: string[];
    status: PostStatus;
  };

  type GenerationJob = {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    draftSlug: string | null;
    error: string | null;
    draft: PostRecord | null;
  };

  type GenerateResponse = {
    job: GenerationJob;
  };

  type GenerationJobResponse = {
    job: GenerationJob;
  };

  type LogEvent = {
    id: number;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
  };

  let posts = $state<PostRecord[]>([]);
  let logs = $state<LogEvent[]>([]);
  let loadingPosts = $state(false);
  let generating = $state(false);
  let generationJobId = $state<string | null>(null);
  let generationJobStatus = $state<GenerationJob['status'] | null>(null);
  let saving = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  let topic = $state('');
  let summary = $state('');
  let keywords = $state('');
  let category = $state('');
  let requestedTags = $state('');
  let desiredLength = $state<DesiredLength>('medium');
  let referencePostSlugs = $state<string[]>([]);

  let editorSlug = $state('');
  let editorTitle = $state('');
  let editorIngress = $state('');
  let editorTags = $state('');
  let editorBody = $state('');

  let referencePosts = $derived(
    posts.filter((post) => referencePostSlugs.includes(post.slug)).map((post) => post.title)
  );
  let hasDraft = $derived(Boolean(editorSlug));
  let controlsDisabled = $derived(generating || saving);

  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const splitCsv = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const loadPosts = async () => {
    loadingPosts = true;
    errorMessage = '';

    try {
      const data = await requestJson<{ posts: PostRecord[] }>(apiUrl('/api/posts'));
      posts = data.posts;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load posts';
    } finally {
      loadingPosts = false;
    }
  };

  const toggleReferencePost = (slug: string) => {
    referencePostSlugs = referencePostSlugs.includes(slug)
      ? referencePostSlugs.filter((referenceSlug) => referenceSlug !== slug)
      : [...referencePostSlugs, slug];
  };

  const loadDraftIntoEditor = (post: PostRecord) => {
    editorSlug = post.slug;
    editorTitle = post.title;
    editorIngress = post.ingress ?? '';
    editorTags = post.tags.join(', ');
    editorBody = post.body;
  };

  const clearGenerationPoll = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = undefined;
    }
  };

  const pollGenerationJob = async (jobId: string) => {
    try {
      const data = await requestJson<GenerationJobResponse>(
        apiUrl(`/api/generation-jobs/${encodeURIComponent(jobId)}`)
      );
      generationJobStatus = data.job.status;

      if (data.job.status === 'completed' && data.job.draft) {
        clearGenerationPoll();
        loadDraftIntoEditor(data.job.draft);
        statusMessage = `Generated ${data.job.draft.slug}`;
        generationJobId = null;
        generationJobStatus = null;
        generating = false;
        await loadPosts();
        return;
      }

      if (data.job.status === 'failed') {
        clearGenerationPoll();
        errorMessage = data.job.error ?? 'Draft generation failed';
        generationJobId = null;
        generationJobStatus = null;
        generating = false;
        return;
      }

      pollTimer = setTimeout(() => {
        void pollGenerationJob(jobId);
      }, 1500);
    } catch (error) {
      clearGenerationPoll();
      errorMessage = error instanceof Error ? error.message : 'Failed to check generation job';
      generationJobId = null;
      generationJobStatus = null;
      generating = false;
    }
  };

  const generateDraft = async () => {
    generating = true;
    generationJobId = null;
    generationJobStatus = 'queued';
    statusMessage = '';
    errorMessage = '';
    clearGenerationPoll();

    try {
      const payload = {
        topic,
        summary: summary || undefined,
        keywords: splitCsv(keywords),
        category: category || undefined,
        tags: splitCsv(requestedTags),
        desiredLength,
        referencePostSlugs
      };
      const data = await requestJson<GenerateResponse>(
        apiUrl('/api/integrations/openai/generate'),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      generationJobId = data.job.id;
      generationJobStatus = data.job.status;
      statusMessage = 'Generation job started';
      void pollGenerationJob(data.job.id);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Draft generation failed';
      generating = false;
    }
  };

  const saveDraft = async () => {
    if (!editorSlug) return;

    saving = true;
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson(apiUrl(`/api/posts/${encodeURIComponent(editorSlug)}`), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: editorTitle,
          ingress: editorIngress,
          body: editorBody,
          tags: splitCsv(editorTags)
        })
      });
      statusMessage = `${editorSlug} saved`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to save draft';
    } finally {
      saving = false;
    }
  };

  const updateStatus = async (status: PostStatus) => {
    if (!editorSlug) return;

    await saveDraft();

    try {
      await requestJson(apiUrl(`/api/posts/${encodeURIComponent(editorSlug)}/status`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      statusMessage = `${editorSlug} moved to ${status}`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Status update failed';
    }
  };

  const publishDraft = async () => {
    if (!editorSlug) return;

    await saveDraft();

    try {
      await requestJson(apiUrl(`/api/posts/${encodeURIComponent(editorSlug)}/publish`), {
        method: 'POST'
      });
      statusMessage = `${editorSlug} published`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Publish failed';
    }
  };

  onMount(() => {
    void loadPosts();

    const events = new EventSource(apiUrl('/api/logs'));

    events.addEventListener('log', (event) => {
      const parsed = JSON.parse(event.data) as LogEvent;
      logs = [parsed, ...logs].slice(0, 30);
    });

    return () => {
      events.close();
    };
  });

  onDestroy(() => {
    clearGenerationPoll();
    logs = [];
  });
</script>

<svelte:head>
  <title>Drafts editor | Blog Agent</title>
</svelte:head>

<div class="space-y-4">
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

  {#if generating}
    <div class="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
      <div class="flex items-center gap-3">
        <span
          class="h-4 w-4 animate-spin rounded-full border-2 border-cyan-700 border-t-transparent"
        ></span>
        <span>
          Generation {generationJobStatus ?? 'queued'}{generationJobId
            ? ` · ${generationJobId.slice(0, 8)}`
            : ''}
        </span>
      </div>
    </div>
  {/if}

  <section class="grid grid-rows-2 gap-2">
    <section class="grid grid-cols-2 gap-2">
      <form
        class="space-y-4 rounded-md border border-slate-200 bg-white p-4"
        onsubmit={(event) => {
          event.preventDefault();
          void generateDraft();
        }}
      >
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-lg font-semibold text-slate-950">Generate</h1>
          <button
            class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={generating}
            type="submit"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Topic</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={topic}
            disabled={generating}
            minlength="10"
            required
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Summary</span>
          <textarea
            class="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={summary}
            disabled={generating}
          ></textarea>
        </label>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Length</span>
            <select
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              bind:value={desiredLength}
              disabled={generating}
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
              disabled={generating}
            />
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Keywords</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={keywords}
            disabled={generating}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Tags</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={requestedTags}
            disabled={generating}
          />
        </label>

        <p class="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {referencePosts.length > 0 ? referencePosts.join(', ') : 'No reference posts selected.'}
        </p>
      </form>

      <div class="grid grid-rows-2 gap-2">
        <aside class="w-full rounded-md border border-slate-200 bg-white p-4">
          <h2 class="text-base font-semibold text-slate-950">Logs</h2>
          <div class="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
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

        <aside class="w-full rounded-md border border-slate-200 bg-white">
          <div class="border-b border-slate-200 p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-slate-950">References</h2>
              <button
                class="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                disabled={generating}
                type="button"
                onclick={() => void loadPosts()}
              >
                Refresh
              </button>
            </div>
          </div>

          <div class="max-h-184 overflow-auto">
            {#if loadingPosts}
              <p class="p-4 text-sm text-slate-500">Loading posts...</p>
            {:else if posts.length === 0}
              <p class="p-4 text-sm text-slate-500">No posts available.</p>
            {:else}
              {#each posts as post (post.id)}
                <div class="border-b border-slate-100 p-3">
                  <label class="flex gap-2 text-sm">
                    <input
                      checked={referencePostSlugs.includes(post.slug)}
                      disabled={generating}
                      onchange={() => toggleReferencePost(post.slug)}
                      type="checkbox"
                    />
                    <span>
                      <span class="block font-medium text-slate-900">{post.title}</span>
                      <span class="text-xs text-slate-500">{post.status} · {post.slug}</span>
                    </span>
                  </label>
                  {#if post.status === 'draft' || post.status === 'approved'}
                    <button
                      class="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                      disabled={generating}
                      type="button"
                      onclick={() => loadDraftIntoEditor(post)}
                    >
                      Edit
                    </button>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </aside>
      </div>
    </section>

    <section class="rounded-md border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-950">Editor</h2>
          <p class="text-sm text-slate-500">{editorSlug || 'Generate or select a draft.'}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled}
            type="button"
            onclick={() => void saveDraft()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            class="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled}
            type="button"
            onclick={() => void updateStatus('approved')}
          >
            Approve
          </button>
          <button
            class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled}
            type="button"
            onclick={() => void updateStatus('rejected')}
          >
            Reject
          </button>
          <button
            class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled}
            type="button"
            onclick={() => void publishDraft()}
          >
            Publish
          </button>
        </div>
      </div>

      <div class="space-y-4 p-4">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Title</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={editorTitle}
            disabled={!hasDraft || generating}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Ingress</span>
          <textarea
            class="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={editorIngress}
            disabled={!hasDraft || generating}
          ></textarea>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Tags</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={editorTags}
            disabled={!hasDraft || generating}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Markdown Body</span>
          <textarea
            class="mt-1 min-h-136 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
            bind:value={editorBody}
            disabled={!hasDraft || generating}
            spellcheck="false"
          ></textarea>
        </label>
      </div>
    </section>
  </section>
</div>
