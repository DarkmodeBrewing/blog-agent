<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<section class="space-y-5">
  <div>
    <h1 class="text-3xl font-semibold text-slate-950">Blog Agent</h1>
    <p class="mt-2 max-w-2xl text-slate-600">
      AI-assisted drafting, review, GitHub publishing, and a local post library.
    </p>
  </div>

  <a
    class="inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
    href={resolve('/drafts')}
  >
    Open drafts
  </a>
</section>
