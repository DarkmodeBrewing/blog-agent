<script lang="ts">
  import { resolve } from '$app/paths';
  import { apiUrl, requestJson } from '$lib/client/request-json';

  type DailyUsage = {
    date: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    request_count: number;
  };

  type SessionUsage = {
    session_id: string;
    model: string;
    first_seen: string;
    last_seen: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    request_count: number;
  };

  type RecentUsage = {
    id: number;
    sessionId: string;
    operation: string;
    stage: string;
    model: string;
    responseId: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    createdAt: string;
  };

  type TokenUsageResponse = {
    days: number;
    daily: DailyUsage[];
    sessions: SessionUsage[];
    recent: RecentUsage[];
  };

  let days = $state(30);
  let daily = $state<DailyUsage[]>([]);
  let sessions = $state<SessionUsage[]>([]);
  let recent = $state<RecentUsage[]>([]);
  let loading = $state(false);
  let errorMessage = $state('');

  let totalTokens = $derived(daily.reduce((sum, row) => sum + row.total_tokens, 0));
  let totalRequests = $derived(daily.reduce((sum, row) => sum + row.request_count, 0));
  let modelTotals = $derived(
    Object.values(
      daily.reduce<Record<string, { model: string; totalTokens: number; requestCount: number }>>(
        (totals, row) => {
          totals[row.model] ??= {
            model: row.model,
            totalTokens: 0,
            requestCount: 0
          };
          totals[row.model].totalTokens += row.total_tokens;
          totals[row.model].requestCount += row.request_count;

          return totals;
        },
        {}
      )
    ).sort((a, b) => b.totalTokens - a.totalTokens)
  );
  let maxDailyTokens = $derived(Math.max(1, ...daily.map((row) => row.total_tokens)));

  const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

  const loadUsage = async () => {
    loading = true;
    errorMessage = '';

    try {
      const data = await requestJson<TokenUsageResponse>(apiUrl(`/api/token-usage?days=${days}`));
      daily = data.daily;
      sessions = data.sessions;
      recent = data.recent;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load token usage';
    } finally {
      loading = false;
    }
  };

  $effect(() => {
    void loadUsage();
  });
</script>

<svelte:head>
  <title>Blog Agent</title>
</svelte:head>

<div class="space-y-6">
  <section class="space-y-5 rounded-md border border-slate-200 bg-white p-6">
    <div class="space-y-3">
      <h1 class="text-3xl font-semibold text-slate-950">Blog Agent</h1>
      <p class="max-w-3xl text-slate-600">
        AI-assisted drafting, review, publishing, and a local content library for blog and social
        variants.
      </p>
    </div>

    <div class="flex flex-wrap gap-3">
      <a
        class="inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        href={resolve('/drafts')}
      >
        Generate post
      </a>
      <a
        class="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        href={resolve('/posts')}
      >
        Open library
      </a>
    </div>
  </section>

  <section class="rounded-md border border-slate-200 bg-white p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-slate-950">Token Usage</h2>
        <p class="text-sm text-slate-500">
          OpenAI usage grouped by date, model, and recent activity.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <label class="sr-only" for="usage-range">Usage range</label>
        <select
          id="usage-range"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          bind:value={days}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={365}>365 days</option>
        </select>
        <button
          class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          disabled={loading}
          type="button"
          onclick={() => void loadUsage()}
        >
          Refresh
        </button>
      </div>
    </div>

    {#if errorMessage}
      <p class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {errorMessage}
      </p>
    {/if}
  </section>

  <section class="grid gap-3 sm:grid-cols-3">
    <div class="rounded-md border border-slate-200 bg-white p-4">
      <p class="text-sm text-slate-500">Total tokens</p>
      <p class="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(totalTokens)}</p>
    </div>
    <div class="rounded-md border border-slate-200 bg-white p-4">
      <p class="text-sm text-slate-500">OpenAI calls</p>
      <p class="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(totalRequests)}</p>
    </div>
    <div class="rounded-md border border-slate-200 bg-white p-4">
      <p class="text-sm text-slate-500">Models</p>
      <p class="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(modelTotals.length)}</p>
    </div>
  </section>

  <section class="rounded-md border border-slate-200 bg-white p-4">
    <h2 class="text-base font-semibold text-slate-950">Usage Over Time</h2>

    {#if daily.length === 0}
      <p class="mt-3 text-sm text-slate-500">No token usage recorded yet.</p>
    {:else}
      <div class="mt-4 space-y-3">
        {#each daily as row (`${row.date}-${row.model}`)}
          <div class="grid gap-2 text-sm sm:grid-cols-[8rem_10rem_minmax(0,1fr)_7rem]">
            <div class="font-medium text-slate-700">{row.date}</div>
            <div class="truncate text-slate-500">{row.model}</div>
            <div class="h-6 overflow-hidden rounded bg-slate-100">
              <div
                class="h-full bg-cyan-700"
                style={`width: ${Math.max(3, (row.total_tokens / maxDailyTokens) * 100)}%`}
              ></div>
            </div>
            <div class="text-right font-medium text-slate-900">
              {formatNumber(row.total_tokens)}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="grid gap-4 xl:grid-cols-2">
    <div class="rounded-md border border-slate-200 bg-white p-4">
      <h2 class="text-base font-semibold text-slate-950">By Model</h2>
      <div class="mt-3 overflow-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">Token totals and call counts grouped by model.</caption>
          <thead class="text-xs text-slate-500 uppercase">
            <tr>
              <th class="py-2" scope="col">Model</th>
              <th class="py-2 text-right" scope="col">Tokens</th>
              <th class="py-2 text-right" scope="col">Calls</th>
            </tr>
          </thead>
          <tbody>
            {#each modelTotals as row (row.model)}
              <tr class="border-t border-slate-100">
                <td class="py-2">{row.model}</td>
                <td class="py-2 text-right">{formatNumber(row.totalTokens)}</td>
                <td class="py-2 text-right">{formatNumber(row.requestCount)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="rounded-md border border-slate-200 bg-white p-4">
      <h2 class="text-base font-semibold text-slate-950">Recent Sessions</h2>
      <div class="mt-3 max-h-96 overflow-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">Recent token usage sessions.</caption>
          <thead class="text-xs text-slate-500 uppercase">
            <tr>
              <th class="py-2" scope="col">Session</th>
              <th class="py-2" scope="col">Model</th>
              <th class="py-2 text-right" scope="col">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {#each sessions as row (row.session_id)}
              <tr class="border-t border-slate-100">
                <td class="py-2 font-mono text-xs">{row.session_id.slice(0, 8)}</td>
                <td class="py-2">{row.model}</td>
                <td class="py-2 text-right">{formatNumber(row.total_tokens)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="rounded-md border border-slate-200 bg-white p-4">
    <h2 class="text-base font-semibold text-slate-950">Recent Calls</h2>
    <div class="mt-3 overflow-auto">
      <table class="w-full text-left text-sm">
        <caption class="sr-only">Most recent OpenAI calls recorded by the application.</caption>
        <thead class="text-xs text-slate-500 uppercase">
          <tr>
            <th class="py-2" scope="col">Time</th>
            <th class="py-2" scope="col">Stage</th>
            <th class="py-2" scope="col">Model</th>
            <th class="py-2 text-right" scope="col">Input</th>
            <th class="py-2 text-right" scope="col">Output</th>
            <th class="py-2 text-right" scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each recent as row (row.id)}
            <tr class="border-t border-slate-100">
              <td class="py-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
              <td class="py-2">{row.stage}</td>
              <td class="py-2">{row.model}</td>
              <td class="py-2 text-right">{formatNumber(row.inputTokens)}</td>
              <td class="py-2 text-right">{formatNumber(row.outputTokens)}</td>
              <td class="py-2 text-right font-medium">{formatNumber(row.totalTokens)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
