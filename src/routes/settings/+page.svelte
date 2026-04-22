<script lang="ts">
  import { apiUrl, requestJson } from '$lib/client/request-json';

  let systemPrompt = $state('');
  let models = $state<string[]>([]);
  let selectedModel = $state('');
  let newModel = $state('');
  let saving = $state(false);
  let savingModels = $state(false);
  let resetting = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  const loadSettings = async () => {
    errorMessage = '';

    try {
      const [promptData, modelData] = await Promise.all([
        requestJson<{ prompt: string }>(apiUrl('/api/settings/system-prompt')),
        requestJson<{ models: string[]; selectedModel: string }>(apiUrl('/api/settings/models'))
      ]);

      systemPrompt = promptData.prompt;
      models = modelData.models;
      selectedModel = modelData.selectedModel;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load settings';
    }
  };

  const savePrompt = async () => {
    saving = true;
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson<{ prompt: string }>(apiUrl('/api/settings/system-prompt'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: systemPrompt })
      });
      statusMessage = 'System prompt saved';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to save system prompt';
    } finally {
      saving = false;
    }
  };

  const resetPrompt = async () => {
    resetting = true;
    statusMessage = '';
    errorMessage = '';

    try {
      const data = await requestJson<{ prompt: string }>(apiUrl('/api/settings/system-prompt'), {
        method: 'DELETE'
      });
      systemPrompt = data.prompt;
      statusMessage = 'System prompt reset';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to reset system prompt';
    } finally {
      resetting = false;
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

  const saveModelSettings = async () => {
    savingModels = true;
    statusMessage = '';
    errorMessage = '';

    try {
      const data = await requestJson<{ models: string[]; selectedModel: string }>(
        apiUrl('/api/settings/models'),
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ models, selectedModel })
        }
      );

      models = data.models;
      selectedModel = data.selectedModel;
      statusMessage = 'Model settings saved';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to save model settings';
    } finally {
      savingModels = false;
    }
  };

  $effect(() => {
    void loadSettings();
  });
</script>

<svelte:head>
  <title>Settings | Blog Agent</title>
</svelte:head>

<section class="space-y-4 rounded-md border border-slate-200 bg-white p-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold text-slate-950">Settings</h1>
      <p class="text-sm text-slate-500">
        Configure the OpenAI model and system prompt used for future draft generations.
      </p>
    </div>
  </div>

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

  <section class="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-slate-950">OpenAI model</h2>
        <p class="text-sm text-slate-500">Choose the model used for future draft generations.</p>
      </div>
      <button
        class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={savingModels || !selectedModel}
        type="button"
        onclick={() => void saveModelSettings()}
      >
        {savingModels ? 'Saving...' : 'Save model'}
      </button>
    </div>

    <label class="block">
      <span class="text-sm font-medium text-slate-700">Selected model</span>
      <select
        class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        bind:value={selectedModel}
      >
        {#each models as model (model)}
          <option value={model}>{model}</option>
        {/each}
      </select>
    </label>

    <div class="flex gap-2">
      <input
        class="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
        bind:value={newModel}
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
        <span
          class="inline-flex items-center gap-2 rounded bg-white px-2 py-1 text-sm text-slate-700"
        >
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

  <section class="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-slate-950">System prompt</h2>
        <p class="text-sm text-slate-500">Edit the instruction used for future generations.</p>
      </div>
      <div class="flex gap-2">
        <button
          class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          disabled={resetting}
          type="button"
          onclick={() => void resetPrompt()}
        >
          {resetting ? 'Resetting...' : 'Reset'}
        </button>
        <button
          class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={saving || systemPrompt.trim().length < 100}
          type="button"
          onclick={() => void savePrompt()}
        >
          {saving ? 'Saving...' : 'Save prompt'}
        </button>
      </div>
    </div>

    <textarea
      class="min-h-[34rem] w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
      bind:value={systemPrompt}
      spellcheck="false"
    ></textarea>
  </section>
</section>
