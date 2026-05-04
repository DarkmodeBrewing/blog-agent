<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { apiUrl, requestJson } from '$lib/client/request-json';
  import { formatTimestamp } from '$lib/time';

  type PostStatus = 'synced' | 'draft' | 'approved' | 'committed' | 'rejected';

  type PostRecord = {
    id: number;
    slug: string;
    title: string;
    status: PostStatus;
    contentType: 'blog' | 'x' | 'linkedin' | 'instagram' | 'generic';
    source: 'github' | 'generated' | 'manual';
    deletedAt: string | null;
    updatedAt: string;
  };

  let posts = $state<PostRecord[]>([]);
  let loading = $state(false);
  let restoring = $state<string | null>(null);
  let statusMessage = $state('');
  let errorMessage = $state('');

  const loadDeletedPosts = async () => {
    loading = true;
    errorMessage = '';

    try {
      const data = await requestJson<{ posts: PostRecord[] }>(apiUrl('/api/posts?deleted=1'));
      posts = data.posts;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load deleted posts';
    } finally {
      loading = false;
    }
  };

  const restorePost = async (slug: string) => {
    restoring = slug;
    statusMessage = '';
    errorMessage = '';

    try {
      await requestJson<{ post: PostRecord }>(
        apiUrl(`/api/posts/${encodeURIComponent(slug)}/restore`),
        {
          method: 'POST'
        }
      );
      statusMessage = `${slug} restored`;
      await loadDeletedPosts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to restore post';
    } finally {
      restoring = null;
    }
  };

  onMount(() => {
    void loadDeletedPosts();
  });
</script>

<svelte:head>
  <title>Deleted posts | Blog Agent</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="space-y-1">
      <a class="text-sm font-medium text-slate-600 hover:underline" href={resolve('/posts')}>
        Back to posts
      </a>
      <h1 class="text-2xl font-semibold text-slate-950">Deleted posts</h1>
    </div>

    <button
      class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
      disabled={loading}
      type="button"
      onclick={() => void loadDeletedPosts()}
    >
      Refresh
    </button>
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

  <section class="rounded-md border border-slate-200 bg-white">
    {#if loading}
      <p class="p-4 text-sm text-slate-500">Loading deleted posts...</p>
    {:else if posts.length === 0}
      <p class="p-4 text-sm text-slate-500">No deleted posts.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[56rem] text-left text-sm">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th class="px-4 py-3" scope="col">Title</th>
              <th class="px-4 py-3" scope="col">Status</th>
              <th class="px-4 py-3" scope="col">Type</th>
              <th class="px-4 py-3" scope="col">Source</th>
              <th class="px-4 py-3" scope="col">Deleted</th>
              <th class="px-4 py-3" scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each posts as post (post.id)}
              <tr class="border-t border-slate-100">
                <td class="px-4 py-3">
                  <div class="font-medium text-slate-950">{post.title}</div>
                  <div class="mt-1 text-xs text-slate-500">{post.slug}</div>
                </td>
                <td class="px-4 py-3 text-slate-700">{post.status}</td>
                <td class="px-4 py-3 text-slate-700">{post.contentType}</td>
                <td class="px-4 py-3 text-slate-700">{post.source}</td>
                <td class="px-4 py-3 text-slate-700">
                  {post.deletedAt ? formatTimestamp(post.deletedAt) : 'Unknown'}
                </td>
                <td class="px-4 py-3">
                  <button
                    class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    disabled={restoring === post.slug}
                    type="button"
                    onclick={() => void restorePost(post.slug)}
                  >
                    {restoring === post.slug ? 'Restoring...' : 'Restore'}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
