<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { resolve } from '$app/paths';

  type ReadinessIssue = {
    id: string;
    severity: 'error' | 'warning';
    title: string;
    message: string;
    href: string;
  };

  type LayoutData = {
    readiness: {
      status: 'ready' | 'ready_with_warnings' | 'incomplete';
      hasBlockingIssues: boolean;
      issues: ReadinessIssue[];
    };
  };

  let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

  let headline = $derived(
    data.readiness.status === 'incomplete'
      ? 'Complete application setup before generating content.'
      : 'Some optional publishing settings still need attention.'
  );
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<header class="bg-(--color_header_bg) p-4 text-(--color_header_fg)">
  <div class="mx-auto flex max-w-6xl items-center justify-between gap-4">
    <img width="75" src={favicon} alt="Blog-agent" />
    <nav aria-label="Primary" class="flex items-center gap-4 text-lg">
      <a class="hover:underline" href={resolve('/')}>Home</a>
      <a class="hover:underline" href={resolve('/drafts')}>Drafts</a>
      <a class="hover:underline" href={resolve('/posts')}>Posts</a>
      <a
        aria-label="Settings"
        class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-100 transition hover:bg-slate-800"
        href={resolve('/settings')}
        title="Settings"
      >
        <svg
          aria-hidden="true"
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.75"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="3.5"></circle>
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.04a1.7 1.7 0 0 0 1.04-1.55V2.4a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.04a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.46 8.4 1.7 1.7 0 0 0 21 9.44h.09a2 2 0 1 1 0 4H21A1.7 1.7 0 0 0 19.4 15z"
          ></path>
        </svg>
      </a>
    </nav>
  </div>
</header>
{#if data.readiness.issues.length > 0}
  <div
    class={`border-b px-6 py-3 text-sm ${
      data.readiness.hasBlockingIssues
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-cyan-200 bg-cyan-50 text-cyan-950'
    }`}
  >
    <div
      class="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-start md:justify-between"
    >
      <div class="space-y-1">
        <p class="font-semibold">{headline}</p>
        <ul class="space-y-1">
          {#each data.readiness.issues as issue (issue.id)}
            <li>{issue.title}: {issue.message}</li>
          {/each}
        </ul>
      </div>
      <a class="font-medium underline" href={resolve('/settings')}>Open settings</a>
    </div>
  </div>
{/if}
<main class="mx-auto max-w-6xl px-6 py-10">
  {@render children()}
</main>
