import z from 'zod/v4';
import { BlogSlugSchema } from '../../openai/model';
import { getPostBySlug } from './post-library';

export const existingPostToolSchema = z.object({
  slug: BlogSlugSchema
});

export const invokeTool = async (name: string, args: unknown, allowedReferenceSlugs: string[]) => {
  switch (name) {
    case 'get_existing_post':
      return getExistingPost(args, allowedReferenceSlugs);
    default:
      return {
        error: `Unknown tool: ${name}`
      };
  }
};

const getExistingPost = async (args: unknown, allowedReferenceSlugs: string[]) => {
  const parsedArgs = existingPostToolSchema.safeParse(args);

  if (!parsedArgs.success) {
    return {
      error: 'Model issued malformed tool arguments',
      issues: parsedArgs.error.issues
    };
  }

  const { slug } = parsedArgs.data;

  if (!allowedReferenceSlugs.includes(slug)) {
    return {
      found: false,
      slug,
      reason: 'This slug was not selected as a reference for this generation run'
    };
  }

  const post = getPostBySlug(slug);

  if (!post) {
    return {
      found: false,
      slug,
      reason: 'No local library post was found for this slug'
    };
  }

  return {
    found: true,
    slug: post.slug,
    status: post.status,
    title: post.title,
    ingress: post.ingress,
    tags: post.tags,
    frontmatter: post.frontmatter,
    body: post.body,
    note:
      post.status === 'rejected'
        ? 'This reference was rejected. Use it as negative or historical context, not as an approved example.'
        : 'This reference was selected by the user for this generation run.'
  };
};
