<script lang="ts">
  import { resolve } from '$app/paths';
  import { apiUrl, requestJson } from '$lib/client/request-json';
  import { onDestroy, onMount } from 'svelte';

  type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';
  type DesiredLength = 'short' | 'medium' | 'long';
  type GenerationOutput = 'blog' | 'x' | 'linkedin';

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
    lockedAt: string | null;
    publicationSummary: {
      total: number;
      publishedTargets: string[];
      failedTargets: string[];
      latestPublishedAt: string | null;
      latestTarget: string | null;
    };
    isPublished: boolean;
    isEditable: boolean;
  };

  type GenerationJob = {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    draftSlug: string | null;
    error: string | null;
    bundleId: number | null;
    primaryDraft: PostRecord | null;
    bundleDrafts: PostRecord[];
    draft: PostRecord | null;
    relatedDrafts: PostRecord[];
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

  type ReadinessIssue = {
    id: string;
    severity: 'error' | 'warning';
    title: string;
    message: string;
    href: string;
  };

  type AppReadiness = {
    status: 'ready' | 'ready_with_warnings' | 'incomplete';
    hasBlockingIssues: boolean;
    readyForGeneration: boolean;
    issues: ReadinessIssue[];
  };

  type PublishTarget =
    | 'markdown_download'
    | 'markdown_disk_export'
    | 'github_repo'
    | 'cms_contentful'
    | 'social_x'
    | 'social_linkedin';

  type PublishTargetOption = {
    id: PublishTarget;
    label: string;
    description: string;
    implemented: boolean;
    requiresConfiguration: boolean;
    kind: 'markdown' | 'repository' | 'cms' | 'social';
    enabled: boolean;
  };

  type FrontmatterPreferences = {
    title: boolean;
    slug: boolean;
    ingress: boolean;
    tags: boolean;
    category: boolean;
    date: boolean;
    draft: boolean;
  };

  type PublishResult = {
    target: PublishTarget;
    post: PostRecord;
    artifact?: {
      filename: string;
      content: string;
      contentType: string;
    };
    filePath?: string;
    remoteUrl?: string;
    commitSha?: string;
  };

  type PostDetailResponse = {
    post: PostRecord;
    relatedPosts: PostRecord[];
  };

  let posts = $state<PostRecord[]>([]);
  let logs = $state<LogEvent[]>([]);
  let appReadiness = $state<AppReadiness | null>(null);
  let publishTargets = $state<PublishTargetOption[]>([]);
  let editorRelatedPosts = $state<PostRecord[]>([]);
  let requestedPublishTargets = $state<PublishTarget[]>(['markdown_download']);
  let loadingPosts = $state(false);
  let generating = $state(false);
  let generationJobId = $state<string | null>(null);
  let generationJobStatus = $state<GenerationJob['status'] | null>(null);
  let saving = $state(false);
  let publishing = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  let topic = $state('');
  let summary = $state('');
  let keywords = $state('');
  let category = $state('');
  let requestedTags = $state('');
  let desiredLength = $state<DesiredLength>('medium');
  let requestedOutputs = $state<GenerationOutput[]>(['blog']);
  let referencePostSlugs = $state<string[]>([]);
  let frontmatterPreferences = $state<FrontmatterPreferences>({
    title: true,
    slug: true,
    ingress: true,
    tags: true,
    category: false,
    date: false,
    draft: false
  });

  let editorSlug = $state('');
  let editorTitle = $state('');
  let editorIngress = $state('');
  let editorTags = $state('');
  let editorBody = $state('');
  let selectedPublishTarget = $state<PublishTarget>('markdown_download');

  let referencePosts = $derived(
    posts.filter((post) => referencePostSlugs.includes(post.slug)).map((post) => post.title)
  );
  let editorPost = $derived(posts.find((post) => post.slug === editorSlug) ?? null);
  let hasDraft = $derived(Boolean(editorSlug));
  let editorLocked = $derived(Boolean(editorPost && !editorPost.isEditable));
  let generationBlocked = $derived(appReadiness ? !appReadiness.readyForGeneration : false);
  let controlsDisabled = $derived(generating || saving || publishing || generationBlocked);

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

  const loadReadiness = async () => {
    try {
      const data = await requestJson<{ readiness: AppReadiness }>(
        apiUrl('/api/settings/readiness')
      );
      appReadiness = data.readiness;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load application status';
    }
  };

  const loadPublishTargets = async () => {
    try {
      const data = await requestJson<{ targets: PublishTargetOption[] }>(
        apiUrl('/api/publish-targets')
      );
      publishTargets = data.targets;

      if (!publishTargets.some((target) => target.id === selectedPublishTarget && target.enabled)) {
        selectedPublishTarget = (publishTargets.find((target) => target.enabled)?.id ??
          'markdown_download') as PublishTarget;
      }

      requestedPublishTargets = publishTargets
        .filter((target) => target.enabled && target.implemented)
        .map((target) => target.id);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load publish targets';
    }
  };

  const loadAppSettings = async () => {
    try {
      const data = await requestJson<{
        settings: {
          frontmatter: FrontmatterPreferences & {
            defaults: {
              category: string;
              date: string;
              draft: boolean;
            };
            order: Array<'title' | 'slug' | 'ingress' | 'tags' | 'category' | 'date' | 'draft'>;
          };
        };
      }>(apiUrl('/api/settings/app'));

      frontmatterPreferences = {
        title: data.settings.frontmatter.title,
        slug: data.settings.frontmatter.slug,
        ingress: data.settings.frontmatter.ingress,
        tags: data.settings.frontmatter.tags,
        category: data.settings.frontmatter.category,
        date: data.settings.frontmatter.date,
        draft: data.settings.frontmatter.draft
      };
    } catch {
      // Keep the local defaults when settings cannot be loaded yet.
    }
  };

  const loadEditorRelations = async () => {
    if (!editorSlug) {
      editorRelatedPosts = [];
      return;
    }

    try {
      const data = await requestJson<PostDetailResponse>(
        apiUrl(`/api/posts/${encodeURIComponent(editorSlug)}`)
      );
      editorRelatedPosts = data.relatedPosts;
    } catch {
      editorRelatedPosts = [];
    }
  };

  const toggleReferencePost = (slug: string) => {
    referencePostSlugs = referencePostSlugs.includes(slug)
      ? referencePostSlugs.filter((referenceSlug) => referenceSlug !== slug)
      : [...referencePostSlugs, slug];
  };

  const toggleOutput = (output: GenerationOutput) => {
    if (output === 'blog') {
      requestedOutputs = requestedOutputs.includes('blog')
        ? ['blog']
        : ['blog', ...requestedOutputs.filter((item) => item !== 'blog')];
      return;
    }

    requestedOutputs = requestedOutputs.includes(output)
      ? requestedOutputs.filter((item) => item !== output)
      : [...requestedOutputs, output];

    if (!requestedOutputs.includes('blog')) {
      requestedOutputs = ['blog', ...requestedOutputs];
    }
  };

  const toggleRequestedPublishTarget = (target: PublishTarget) => {
    requestedPublishTargets = requestedPublishTargets.includes(target)
      ? requestedPublishTargets.filter((item) => item !== target)
      : [...requestedPublishTargets, target];
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

      if (data.job.status === 'completed' && data.job.primaryDraft) {
        clearGenerationPoll();
        loadDraftIntoEditor(data.job.primaryDraft);
        statusMessage =
          data.job.bundleDrafts.length > 1
            ? `Generated ${data.job.bundleDrafts.length} drafts`
            : `Generated ${data.job.primaryDraft.slug}`;
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
    if (generationBlocked) {
      errorMessage = 'Complete the required application setup before generating content';
      return;
    }

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
        outputs: requestedOutputs,
        publishTargets: requestedPublishTargets,
        blogPreferences: {
          frontmatter: frontmatterPreferences
        },
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
    if (editorLocked) {
      errorMessage = 'Published posts are locked. Create a copy to continue editing.';
      return;
    }

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
    if (editorLocked) {
      errorMessage = 'Published posts are locked. Create a copy to continue editing.';
      return;
    }

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
    publishing = true;
    statusMessage = '';
    errorMessage = '';

    try {
      const data = await requestJson<{ result: PublishResult }>(
        apiUrl(`/api/posts/${encodeURIComponent(editorSlug)}/publish`),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: selectedPublishTarget })
        }
      );

      if (data.result.artifact && selectedPublishTarget === 'markdown_download') {
        const blob = new Blob([data.result.artifact.content], {
          type: data.result.artifact.contentType
        });
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = data.result.artifact.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
      }

      statusMessage =
        selectedPublishTarget === 'markdown_disk_export' && data.result.filePath
          ? `${editorSlug} exported to ${data.result.filePath}`
          : selectedPublishTarget === 'github_repo' && data.result.remoteUrl
            ? `${editorSlug} published to GitHub`
            : `${editorSlug} published via ${selectedPublishTarget}`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Publish failed';
    } finally {
      publishing = false;
    }
  };

  const copyMarkdownToClipboard = async () => {
    if (!editorSlug) return;

    try {
      const data = await requestJson<{ result: PublishResult }>(
        apiUrl(`/api/posts/${encodeURIComponent(editorSlug)}/publish`),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'markdown_download' })
        }
      );

      if (!data.result.artifact) {
        throw new Error('No Markdown artifact returned');
      }

      await navigator.clipboard.writeText(data.result.artifact.content);
      statusMessage = `${editorSlug} copied to clipboard`;
      await loadPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Copy failed';
    }
  };

  const createCopy = async (slug = editorSlug) => {
    if (!slug) return;

    try {
      const data = await requestJson<{ post: PostRecord }>(
        apiUrl(`/api/posts/${encodeURIComponent(slug)}/copy`),
        {
          method: 'POST'
        }
      );

      statusMessage = `${slug} copied to ${data.post.slug}`;
      await loadPosts();
      loadDraftIntoEditor(data.post);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Copy failed';
    }
  };

  onMount(() => {
    void loadPosts();
    void loadReadiness();
    void loadPublishTargets();
    void loadAppSettings();

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

  $effect(() => {
    void loadEditorRelations();
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

  {#if appReadiness && !appReadiness.readyForGeneration}
    <div class="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p class="font-medium">Generation is unavailable until setup is complete.</p>
      <p class="mt-1">
        {appReadiness.issues[0]?.message}
        <a class="underline" href={resolve('/settings')}>Open settings</a>.
      </p>
    </div>
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
            disabled={controlsDisabled}
            type="submit"
          >
            {generating ? 'Generating...' : generationBlocked ? 'Setup required' : 'Generate'}
          </button>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Topic</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={topic}
            disabled={controlsDisabled}
            minlength="10"
            required
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Summary</span>
          <textarea
            class="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={summary}
            disabled={controlsDisabled}
          ></textarea>
        </label>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Length</span>
            <select
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              bind:value={desiredLength}
              disabled={controlsDisabled}
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
              disabled={controlsDisabled}
            />
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Keywords</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={keywords}
            disabled={controlsDisabled}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Tags</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={requestedTags}
            disabled={controlsDisabled}
          />
        </label>

        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-slate-700">Outputs</legend>
          <label class="flex gap-2 text-sm">
            <input checked={requestedOutputs.includes('blog')} disabled type="checkbox" />
            <span>
              <span class="block font-medium text-slate-900">Blog</span>
              <span class="text-xs text-slate-500">Primary draft, always generated first.</span>
            </span>
          </label>
          <label class="flex gap-2 text-sm">
            <input
              checked={requestedOutputs.includes('x')}
              disabled={controlsDisabled}
              onchange={() => toggleOutput('x')}
              type="checkbox"
            />
            <span>
              <span class="block font-medium text-slate-900">X</span>
              <span class="text-xs text-slate-500">
                Derived from the generated blog post, single-post sized.
              </span>
            </span>
          </label>
          <label class="flex gap-2 text-sm">
            <input
              checked={requestedOutputs.includes('linkedin')}
              disabled={controlsDisabled}
              onchange={() => toggleOutput('linkedin')}
              type="checkbox"
            />
            <span>
              <span class="block font-medium text-slate-900">LinkedIn</span>
              <span class="text-xs text-slate-500">
                Derived from the generated blog post, shorter than the blog draft.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-slate-700">Planned Publish Targets</legend>
          {#each publishTargets.filter((target) => target.implemented) as target (target.id)}
            <label class="flex gap-2 text-sm">
              <input
                checked={requestedPublishTargets.includes(target.id)}
                disabled={controlsDisabled || !target.enabled}
                onchange={() => toggleRequestedPublishTarget(target.id)}
                type="checkbox"
              />
              <span>
                <span class="block font-medium text-slate-900">{target.label}</span>
                <span class="text-xs text-slate-500">{target.description}</span>
              </span>
            </label>
          {/each}
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-slate-700">Blog Frontmatter Preferences</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each Object.entries(frontmatterPreferences) as [key, enabled] (key)}
              <label class="flex gap-2 text-sm">
                <input
                  checked={enabled}
                  disabled={controlsDisabled}
                  onchange={() =>
                    (frontmatterPreferences = {
                      ...frontmatterPreferences,
                      [key]: !enabled
                    })}
                  type="checkbox"
                />
                <span class="capitalize">{key}</span>
              </label>
            {/each}
          </div>
        </fieldset>

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
                disabled={controlsDisabled}
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
                      disabled={controlsDisabled}
                      onchange={() => toggleReferencePost(post.slug)}
                      type="checkbox"
                    />
                    <span>
                      <span class="block font-medium text-slate-900">{post.title}</span>
                      <span class="text-xs text-slate-500">{post.status} · {post.slug}</span>
                    </span>
                  </label>
                  {#if post.isEditable}
                    <button
                      class="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                      disabled={controlsDisabled}
                      type="button"
                      onclick={() => loadDraftIntoEditor(post)}
                    >
                      Edit
                    </button>
                  {:else if post.isPublished}
                    <button
                      class="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
                      disabled={controlsDisabled}
                      type="button"
                      onclick={() => void createCopy(post.slug)}
                    >
                      Create copy
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
        <div class="flex flex-wrap items-center gap-2">
          <label class="min-w-52">
            <span class="sr-only">Publish target</span>
            <select
              bind:value={selectedPublishTarget}
              class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              disabled={!hasDraft || controlsDisabled}
            >
              {#each publishTargets.filter((target) => target.implemented) as target (target.id)}
                <option disabled={!target.enabled} value={target.id}>
                  {target.label}{target.enabled ? '' : ' (Unavailable)'}
                </option>
              {/each}
            </select>
          </label>
          <button
            class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled || editorLocked}
            type="button"
            onclick={() => void saveDraft()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            class="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled || editorLocked}
            type="button"
            onclick={() => void updateStatus('approved')}
          >
            Approve
          </button>
          <button
            class="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled || editorLocked}
            type="button"
            onclick={() => void updateStatus('rejected')}
          >
            Reject
          </button>
          <button
            class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled}
            type="button"
            onclick={() => void copyMarkdownToClipboard()}
          >
            Copy Markdown
          </button>
          <button
            class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!hasDraft || controlsDisabled}
            type="button"
            onclick={() => void publishDraft()}
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      <div class="space-y-4 p-4">
        {#if editorLocked}
          <div
            class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <p class="font-medium">This post is locked because it has been published.</p>
            <p class="mt-1">
              Create a copy to continue editing without changing the published version.
            </p>
          </div>
        {/if}

        {#if editorPost && editorPost.publicationSummary.publishedTargets.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each editorPost.publicationSummary.publishedTargets as target (target)}
              <span class="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                Published: {target}
              </span>
            {/each}
          </div>
        {/if}

        {#if editorRelatedPosts.length > 0}
          <section class="rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3 class="text-sm font-semibold text-slate-900">Related Variants</h3>
            <div class="mt-3 space-y-2">
              {#each editorRelatedPosts as related (related.id)}
                <button
                  class="block w-full rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-100"
                  type="button"
                  onclick={() => loadDraftIntoEditor(related)}
                >
                  <span class="block font-medium text-slate-900">{related.title}</span>
                  <span class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{related.contentType}</span>
                    <span>{related.variantRole}</span>
                    <span>{related.status}</span>
                  </span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Title</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={editorTitle}
            disabled={!hasDraft || controlsDisabled || editorLocked}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Ingress</span>
          <textarea
            class="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={editorIngress}
            disabled={!hasDraft || controlsDisabled || editorLocked}
          ></textarea>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Tags</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={editorTags}
            disabled={!hasDraft || controlsDisabled || editorLocked}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Markdown Body</span>
          <textarea
            class="mt-1 min-h-136 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
            bind:value={editorBody}
            disabled={!hasDraft || controlsDisabled || editorLocked}
            spellcheck="false"
          ></textarea>
        </label>
      </div>
    </section>
  </section>
</div>
