import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BlogSlugSchema } from '../../../../../openai/model';
import { getPostBySlug } from '$lib/server/post-library';
import { renderPostAsMarkdown } from '$lib/server/publishing';
import { createRequestId, logWorkflow } from '$lib/server/workflow-log';

export const GET: RequestHandler = async ({ params }) => {
  const requestId = createRequestId();
  const parsedSlug = BlogSlugSchema.safeParse(params.slug);

  if (!parsedSlug.success) {
    return json({ error: 'Invalid slug', issues: parsedSlug.error.issues }, { status: 400 });
  }

  const post = getPostBySlug(parsedSlug.data);

  if (!post) {
    return json({ error: 'Post not found' }, { status: 404 });
  }

  logWorkflow({
    level: 'info',
    message: 'post.export.rendered',
    context: {
      actionId: `markdown_render_${post.slug}`,
      requestId,
      slug: post.slug,
      target: 'markdown_download'
    },
    details: {
      filename: `${post.slug}.md`,
      bodyLength: post.body.length
    }
  });

  return json({
    post,
    artifact: await renderPostAsMarkdown(post)
  });
};
