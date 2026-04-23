<script lang="ts">
  import { apiUrl, requestJson } from '$lib/client/request-json';

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
    readyForGitHubPublishing: boolean;
    readyForGitHubSync: boolean;
    issues: ReadinessIssue[];
  };

  type AppSettingsResponse = {
    settings: {
      openai: {
        apiKeyConfigured: boolean;
        apiKeyMasked: string | null;
        models: string[];
        selectedModel: string;
      };
      github: {
        enabled: boolean;
        tokenConfigured: boolean;
        tokenMasked: string | null;
        owner: string;
        repo: string;
        branch: string;
        blogPostPath: string;
      };
      markdownExport: {
        downloadEnabled: boolean;
        diskExportEnabled: boolean;
        diskExportPath: string;
      };
      frontmatter: {
        title: boolean;
        slug: boolean;
        ingress: boolean;
        tags: boolean;
        category: boolean;
        date: boolean;
        draft: boolean;
        defaults: {
          category: string;
          date: string;
          draft: boolean;
        };
        order: Array<'title' | 'slug' | 'ingress' | 'tags' | 'category' | 'date' | 'draft'>;
      };
    };
    readiness: AppReadiness;
  };

  type FrontmatterField = 'title' | 'slug' | 'ingress' | 'tags' | 'category' | 'date' | 'draft';

  type PromptTemplates = {
    sharedVoice: string;
    blogGeneration: string;
    socialGeneration: string;
    guardrails: string;
    composedPrompt: string;
  };

  let promptTemplates = $state<PromptTemplates>({
    sharedVoice: '',
    blogGeneration: '',
    socialGeneration: '',
    guardrails: '',
    composedPrompt: ''
  });
  let appReadiness = $state<AppReadiness | null>(null);

  let openaiApiKeyConfigured = $state(false);
  let openaiApiKeyMasked = $state<string | null>(null);
  let openaiApiKeyInput = $state('');
  let clearOpenAIApiKey = $state(false);

  let models = $state<string[]>([]);
  let selectedModel = $state('');
  let newModel = $state('');

  let githubEnabled = $state(false);
  let githubTokenConfigured = $state(false);
  let githubTokenMasked = $state<string | null>(null);
  let githubTokenInput = $state('');
  let clearGitHubToken = $state(false);
  let githubOwner = $state('');
  let githubRepo = $state('');
  let githubBranch = $state('main');
  let githubBlogPostPath = $state('');

  let markdownDownloadEnabled = $state(true);
  let markdownDiskExportEnabled = $state(false);
  let markdownDiskExportPath = $state('');

  let frontmatterTitle = $state(true);
  let frontmatterSlug = $state(true);
  let frontmatterIngress = $state(true);
  let frontmatterTags = $state(true);
  let frontmatterCategory = $state(false);
  let frontmatterDate = $state(false);
  let frontmatterDraft = $state(false);
  let frontmatterDefaultCategory = $state('');
  let frontmatterDefaultDate = $state('');
  let frontmatterDefaultDraft = $state(true);
  let frontmatterOrder = $state<FrontmatterField[]>([
    'title',
    'slug',
    'ingress',
    'tags',
    'category',
    'date',
    'draft'
  ]);

  let loading = $state(false);
  let savingAppSettings = $state(false);
  let savingPrompt = $state(false);
  let resettingPrompt = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');
  let appSettingsSaveDisabled = $derived(
    savingAppSettings || loading || models.length === 0 || !selectedModel
  );
  let composedPromptPreview = $derived(
    [
      promptTemplates.sharedVoice,
      promptTemplates.blogGeneration,
      promptTemplates.socialGeneration,
      promptTemplates.guardrails
    ]
      .map((section) => section.trim())
      .filter(Boolean)
      .join('\n\n')
  );

  const applySettings = (data: AppSettingsResponse) => {
    appReadiness = data.readiness;

    openaiApiKeyConfigured = data.settings.openai.apiKeyConfigured;
    openaiApiKeyMasked = data.settings.openai.apiKeyMasked;
    models = data.settings.openai.models;
    selectedModel = data.settings.openai.selectedModel;
    openaiApiKeyInput = '';
    clearOpenAIApiKey = false;

    githubEnabled = data.settings.github.enabled;
    githubTokenConfigured = data.settings.github.tokenConfigured;
    githubTokenMasked = data.settings.github.tokenMasked;
    githubOwner = data.settings.github.owner;
    githubRepo = data.settings.github.repo;
    githubBranch = data.settings.github.branch;
    githubBlogPostPath = data.settings.github.blogPostPath;
    githubTokenInput = '';
    clearGitHubToken = false;

    markdownDownloadEnabled = data.settings.markdownExport.downloadEnabled;
    markdownDiskExportEnabled = data.settings.markdownExport.diskExportEnabled;
    markdownDiskExportPath = data.settings.markdownExport.diskExportPath;

    frontmatterTitle = data.settings.frontmatter.title;
    frontmatterSlug = data.settings.frontmatter.slug;
    frontmatterIngress = data.settings.frontmatter.ingress;
    frontmatterTags = data.settings.frontmatter.tags;
    frontmatterCategory = data.settings.frontmatter.category;
    frontmatterDate = data.settings.frontmatter.date;
    frontmatterDraft = data.settings.frontmatter.draft;
    frontmatterDefaultCategory = data.settings.frontmatter.defaults.category;
    frontmatterDefaultDate = data.settings.frontmatter.defaults.date;
    frontmatterDefaultDraft = data.settings.frontmatter.defaults.draft;
    frontmatterOrder = data.settings.frontmatter.order;
  };

  const loadSettings = async () => {
    loading = true;
    errorMessage = '';

    try {
      const [promptData, appData] = await Promise.all([
        requestJson<{ templates: PromptTemplates }>(apiUrl('/api/settings/prompt-templates')),
        requestJson<AppSettingsResponse>(apiUrl('/api/settings/app'))
      ]);

      promptTemplates = promptData.templates;
      applySettings(appData);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load settings';
    } finally {
      loading = false;
    }
  };

  const addModel = () => {
    const model = newModel.trim();

    if (!model || models.includes(model)) {
      newModel = '';
      return;
    }

    models = [...models, model];
    selectedModel = model;
    newModel = '';
  };

  const removeModel = (model: string) => {
    if (model === selectedModel || models.length <= 1) return;
    models = models.filter((item) => item !== model);
  };

  const moveFrontmatterField = (field: FrontmatterField, direction: -1 | 1) => {
    const index = frontmatterOrder.indexOf(field);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= frontmatterOrder.length) {
      return;
    }

    const next = [...frontmatterOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    frontmatterOrder = next;
  };

  const saveAppSettings = async () => {
    savingAppSettings = true;
    errorMessage = '';
    statusMessage = '';

    try {
      const data = await requestJson<AppSettingsResponse>(apiUrl('/api/settings/app'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          openai: {
            apiKey: openaiApiKeyInput || undefined,
            clearApiKey: clearOpenAIApiKey,
            models,
            selectedModel
          },
          github: {
            enabled: githubEnabled,
            token: githubTokenInput || undefined,
            clearToken: clearGitHubToken,
            owner: githubOwner,
            repo: githubRepo,
            branch: githubBranch,
            blogPostPath: githubBlogPostPath
          },
          markdownExport: {
            downloadEnabled: markdownDownloadEnabled,
            diskExportEnabled: markdownDiskExportEnabled,
            diskExportPath: markdownDiskExportPath
          },
          frontmatter: {
            title: frontmatterTitle,
            slug: frontmatterSlug,
            ingress: frontmatterIngress,
            tags: frontmatterTags,
            category: frontmatterCategory,
            date: frontmatterDate,
            draft: frontmatterDraft,
            defaults: {
              category: frontmatterDefaultCategory,
              date: frontmatterDefaultDate,
              draft: frontmatterDefaultDraft
            },
            order: frontmatterOrder
          }
        })
      });

      applySettings(data);
      statusMessage = 'Application settings saved';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to save application settings';
    } finally {
      savingAppSettings = false;
    }
  };

  const savePrompt = async () => {
    savingPrompt = true;
    errorMessage = '';
    statusMessage = '';

    try {
      const data = await requestJson<{ templates: PromptTemplates }>(
        apiUrl('/api/settings/prompt-templates'),
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sharedVoice: promptTemplates.sharedVoice,
            blogGeneration: promptTemplates.blogGeneration,
            socialGeneration: promptTemplates.socialGeneration,
            guardrails: promptTemplates.guardrails
          })
        }
      );

      promptTemplates = data.templates;
      statusMessage = 'Prompt templates saved';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to save prompt templates';
    } finally {
      savingPrompt = false;
    }
  };

  const resetPrompt = async () => {
    resettingPrompt = true;
    errorMessage = '';
    statusMessage = '';

    try {
      const data = await requestJson<{ templates: PromptTemplates }>(
        apiUrl('/api/settings/prompt-templates'),
        {
          method: 'DELETE'
        }
      );
      promptTemplates = data.templates;
      statusMessage = 'Prompt templates reset';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to reset prompt templates';
    } finally {
      resettingPrompt = false;
    }
  };

  $effect(() => {
    void loadSettings();
  });
</script>

<svelte:head>
  <title>Settings | Blog Agent</title>
</svelte:head>

<section class="space-y-4">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-slate-950">Settings</h1>
      <p class="mt-2 max-w-3xl text-sm text-slate-600">
        Configure OpenAI access, optional GitHub publishing, Markdown export defaults, and the
        global frontmatter template.
      </p>
    </div>
    <button
      class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      disabled={appSettingsSaveDisabled}
      type="button"
      onclick={() => void saveAppSettings()}
    >
      {savingAppSettings ? 'Saving...' : 'Save application settings'}
    </button>
  </div>

  <nav
    aria-label="Settings sections"
    class="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white p-3"
  >
    <a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700" href="#setup"
      >App setup</a
    >
    <a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700" href="#models"
      >Models</a
    >
    <a
      class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
      href="#publishing">Publishing targets</a
    >
    <a
      class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
      href="#frontmatter">Frontmatter</a
    >
    <a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700" href="#prompts"
      >Prompts</a
    >
  </nav>

  {#if appReadiness}
    <section
      class={`rounded-md border p-4 ${
        appReadiness.hasBlockingIssues
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : appReadiness.issues.length > 0
            ? 'border-cyan-200 bg-cyan-50 text-cyan-950'
            : 'border-emerald-200 bg-emerald-50 text-emerald-950'
      }`}
    >
      <h2 class="text-base font-semibold">
        {appReadiness.hasBlockingIssues
          ? 'Setup required'
          : appReadiness.issues.length > 0
            ? 'Setup has optional follow-up'
            : 'Application is ready'}
      </h2>

      {#if appReadiness.issues.length > 0}
        <ul class="mt-2 space-y-1 text-sm">
          {#each appReadiness.issues as issue (issue.id)}
            <li>{issue.title}: {issue.message}</li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm">OpenAI configuration is complete and generation is available.</p>
      {/if}
    </section>
  {/if}

  {#if statusMessage}
    <p
      aria-live="polite"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      {statusMessage}
    </p>
  {/if}

  {#if errorMessage}
    <p
      aria-live="assertive"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {errorMessage}
    </p>
  {/if}

  <section class="space-y-4" id="setup">
    <div>
      <h2 class="text-lg font-semibold text-slate-950">App setup</h2>
      <p class="text-sm text-slate-500">
        Required credentials and core runtime configuration live here.
      </p>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-950">OpenAI</h3>
          <p class="text-sm text-slate-500">
            The API key is required before generation can be used anywhere in the app.
          </p>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Stored API key</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            disabled
            value={openaiApiKeyConfigured ? (openaiApiKeyMasked ?? 'Configured') : 'Not configured'}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">New API key</span>
          <input
            autocomplete="off"
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            bind:value={openaiApiKeyInput}
            placeholder="sk-..."
            type="password"
          />
        </label>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={clearOpenAIApiKey} type="checkbox" />
          Clear stored OpenAI API key on save
        </label>
      </section>

      <section class="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-slate-950">GitHub publishing</h3>
            <p class="text-sm text-slate-500">
              Optional. Enable only if you want GitHub sync and publish actions available.
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input bind:checked={githubEnabled} type="checkbox" />
            Enabled
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Stored token</span>
          <input
            class="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            disabled
            value={githubTokenConfigured ? (githubTokenMasked ?? 'Configured') : 'Not configured'}
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">New token</span>
          <input
            autocomplete="off"
            bind:value={githubTokenInput}
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="ghp_..."
            type="password"
          />
        </label>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={clearGitHubToken} type="checkbox" />
          Clear stored GitHub token on save
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Owner</span>
            <input
              bind:value={githubOwner}
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="darkmode"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-slate-700">Repository</span>
            <input
              bind:value={githubRepo}
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="blog"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-slate-700">Branch</span>
            <input
              bind:value={githubBranch}
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="main"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium text-slate-700">Content path</span>
            <input
              bind:value={githubBlogPostPath}
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="content/posts"
            />
          </label>
        </div>
      </section>
    </div>
  </section>

  <section class="space-y-4" id="models">
    <div>
      <h2 class="text-lg font-semibold text-slate-950">Models</h2>
      <p class="text-sm text-slate-500">
        Store the selectable model list in the application instead of environment files.
      </p>
    </div>

    <section class="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h3 class="text-lg font-semibold text-slate-950">Model selection</h3>
        <p class="text-sm text-slate-500">
          Select the default model and keep a local list of allowed model ids.
        </p>
      </div>

      <label class="block">
        <span class="text-sm font-medium text-slate-700">Selected model</span>
        <select
          bind:value={selectedModel}
          class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          {#each models as model (model)}
            <option value={model}>{model}</option>
          {/each}
        </select>
      </label>

      <div class="flex gap-2">
        <input
          bind:value={newModel}
          class="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
          placeholder="Add model name"
        />
        <button
          class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          type="button"
          onclick={addModel}
        >
          Add
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        {#each models as model (model)}
          <span class="inline-flex items-center gap-2 rounded bg-slate-100 px-2 py-1 text-sm">
            {model}
            <button
              class="text-xs font-medium text-slate-500 disabled:opacity-40"
              disabled={model === selectedModel || models.length <= 1}
              type="button"
              onclick={() => removeModel(model)}
            >
              Remove
            </button>
          </span>
        {/each}
      </div>
    </section>
  </section>

  <section class="space-y-4" id="publishing">
    <div>
      <h2 class="text-lg font-semibold text-slate-950">Publishing targets</h2>
      <p class="text-sm text-slate-500">
        Configure Markdown export behavior and optional repository publishing.
      </p>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="space-y-4 rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-950">Markdown export defaults</h3>
          <p class="text-sm text-slate-500">
            Download runs in the browser. Disk export writes to the server filesystem.
          </p>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={markdownDownloadEnabled} type="checkbox" />
          Allow browser download export
        </label>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={markdownDiskExportEnabled} type="checkbox" />
          Allow server-side disk export
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Disk export path</span>
          <input
            bind:value={markdownDiskExportPath}
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="/workspace/blog-agent/exports"
          />
        </label>

        <p class="text-sm text-slate-500">
          Copy-to-clipboard remains available in the UI and does not need separate configuration.
        </p>
      </section>
    </div>
  </section>

  <section class="space-y-4" id="frontmatter">
    <div>
      <h2 class="text-lg font-semibold text-slate-950">Frontmatter</h2>
      <p class="text-sm text-slate-500">
        These rules affect both exported Markdown and how the generation schema is built.
      </p>
    </div>

    <section class="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h3 class="text-lg font-semibold text-slate-950">Global blog frontmatter template</h3>
        <p class="text-sm text-slate-500">These fields shape export output and generation rules.</p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterTitle} type="checkbox" />
          Title
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterSlug} type="checkbox" />
          Slug
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterIngress} type="checkbox" />
          Ingress
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterTags} type="checkbox" />
          Tags
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterCategory} type="checkbox" />
          Category
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterDate} type="checkbox" />
          Date
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterDraft} type="checkbox" />
          Draft
        </label>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Default category</span>
          <input
            bind:value={frontmatterDefaultCategory}
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="engineering"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Default date</span>
          <input
            bind:value={frontmatterDefaultDate}
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="2026-04-23"
          />
        </label>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input bind:checked={frontmatterDefaultDraft} type="checkbox" />
          Draft default value is true
        </label>
      </div>

      <div class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div>
          <h3 class="text-sm font-medium text-slate-900">Frontmatter field order</h3>
          <p class="text-xs text-slate-500">This controls key order in exported Markdown.</p>
        </div>

        <div class="space-y-2">
          {#each frontmatterOrder as field, index (field)}
            <div
              class="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm"
            >
              <span class="text-slate-800 capitalize">{field}</span>
              <div class="flex gap-2">
                <button
                  class="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
                  disabled={index === 0}
                  type="button"
                  onclick={() => moveFrontmatterField(field, -1)}
                >
                  Up
                </button>
                <button
                  class="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
                  disabled={index === frontmatterOrder.length - 1}
                  type="button"
                  onclick={() => moveFrontmatterField(field, 1)}
                >
                  Down
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>
  </section>

  <section class="space-y-4" id="prompts">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">Prompts</h2>
        <p class="text-sm text-slate-500">
          Edit the instruction blocks used to compose future generation prompts.
        </p>
      </div>
    </div>

    <section class="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-950">Prompt templates</h3>
          <p class="text-sm text-slate-500">Store reusable prompt blocks in the database.</p>
        </div>
        <div class="flex gap-2">
          <button
            class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            disabled={resettingPrompt}
            type="button"
            onclick={() => void resetPrompt()}
          >
            {resettingPrompt ? 'Resetting...' : 'Reset'}
          </button>
          <button
            class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={savingPrompt ||
              promptTemplates.sharedVoice.trim().length < 50 ||
              promptTemplates.blogGeneration.trim().length < 50 ||
              promptTemplates.socialGeneration.trim().length < 50 ||
              promptTemplates.guardrails.trim().length < 50}
            type="button"
            onclick={() => void savePrompt()}
          >
            {savingPrompt ? 'Saving...' : 'Save prompts'}
          </button>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Shared editorial voice</span>
          <textarea
            bind:value={promptTemplates.sharedVoice}
            class="mt-1 min-h-60 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
            spellcheck="false"
          ></textarea>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Blog generation instructions</span>
          <textarea
            bind:value={promptTemplates.blogGeneration}
            class="mt-1 min-h-60 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
            spellcheck="false"
          ></textarea>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Derived social instructions</span>
          <textarea
            bind:value={promptTemplates.socialGeneration}
            class="mt-1 min-h-60 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
            spellcheck="false"
          ></textarea>
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Guardrails</span>
          <textarea
            bind:value={promptTemplates.guardrails}
            class="mt-1 min-h-60 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
            spellcheck="false"
          ></textarea>
        </label>
      </div>

      <label class="block">
        <span class="text-sm font-medium text-slate-700">Composed prompt preview</span>
        <textarea
          class="mt-1 min-h-[22rem] w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm leading-6 text-slate-700"
          disabled
          spellcheck="false"
          value={composedPromptPreview}
        ></textarea>
      </label>
    </section>
  </section>

  <div class="flex justify-end">
    <button
      class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      disabled={appSettingsSaveDisabled}
      type="button"
      onclick={() => void saveAppSettings()}
    >
      {savingAppSettings ? 'Saving...' : 'Save application settings'}
    </button>
  </div>
</section>
