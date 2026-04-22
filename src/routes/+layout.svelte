<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { resolve } from '$app/paths';

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<header class="bg-(--color_header_bg) p-4 text-(--color_header_fg)">
  <div class="mx-auto flex max-w-4xl justify-between">
    <img width="75" src={favicon} alt="Blog-agent" />
    <div class="flex items-center-safe text-2xl">
      <a class="hover:underline" href={resolve('/')}>Home</a>
      <a class="pl-4 hover:underline" href={resolve('/posts')}>Posts</a>
    </div>
  </div>
</header>
<main class="mx-auto max-w-4xl px-6 py-10">
  {@render children()}
</main>
