import z from 'zod/v4';
import { BlogSlugSchema } from '../../openai/model';
import { getPostsFromRepo } from './get-posts-from-repo';

export const existingPostToolSchema = z.object({
  slug: BlogSlugSchema
});

export const invokeTool = async (name: string, args: unknown) => {
  switch (name) {
    case 'get_existing_post':
      return getExistingPost(args);
    default:
      return {
        error: `Unknown tool: ${name}`
      };
  }
};

const getExistingPost = async (args: unknown) => {
  const parsedArgs = existingPostToolSchema.safeParse(args);

  if (!parsedArgs.success) {
    return {
      error: 'Model issued malformed tool arguments',
      issues: parsedArgs.error.issues
    };
  }

  return await getPostsFromRepo(parsedArgs.data.slug);
};
