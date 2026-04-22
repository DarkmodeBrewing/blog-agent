<script lang="ts">
  import { apiUrl, requestJson } from '$lib/client/request-json';

  let systemPrompt = $state('');
  let saving = $state(false);
  let resetting = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state('');

  const loadPrompt = async () => {
    errorMessage = '';

    try {
      const data = await requestJson<{ prompt: string }>(apiUrl('/api/settings/system-prompt'));
      systemPrompt = data.prompt;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load system prompt';
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

  $effect(() => {
    void loadPrompt();
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
        Edit the system prompt used for future draft generations.
      </p>
    </div>
    <div class="flex gap-2">
      <button
        class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
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

  <textarea
    class="min-h-[34rem] w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-900"
    bind:value={systemPrompt}
    spellcheck="false"
  ></textarea>
</section>
