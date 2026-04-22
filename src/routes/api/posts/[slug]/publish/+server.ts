import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { publishApprovedDraft } from '$lib/server/post-library';

export const POST: RequestHandler = async ({ params }) => {
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  try {
    const post = await publishApprovedDraft(parsedSlug.data);

    if (!post) {
      return json({ error: 'Post not found' }, { status: 404 });
    }

    return json({ post });
  } catch (cause) {
    return json(
      {
        error: cause instanceof Error ? cause.message : 'Failed to publish post'
      },
      { status: 400 }
    );
  }
};
