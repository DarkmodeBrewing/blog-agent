import { z } from 'zod/v4';

export const BlogLengthSchema = z.enum(['short', 'medium', 'long']);
export const GenerationOutputSchema = z.enum(['blog', 'x', 'linkedin']);
export const PublishTargetSchema = z.enum([
  'markdown_download',
  'markdown_disk_export',
  'github_repo',
  'cms_contentful',
  'social_x',
  'social_linkedin'
]);
export const BlogSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+$/);

export const BlogFrontmatterPreferenceSchema = z.object({
  title: z.boolean().optional(),
  slug: z.boolean().optional(),
  ingress: z.boolean().optional(),
  tags: z.boolean().optional(),
  category: z.boolean().optional(),
  date: z.boolean().optional(),
  draft: z.boolean().optional()
});

export type BlogFrontmatterPreference = z.infer<typeof BlogFrontmatterPreferenceSchema>;

export const DraftRequestSchema = z.object({
  topic: z.string().min(10),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  desiredLength: BlogLengthSchema,
  outputs: z.array(GenerationOutputSchema).min(1).default(['blog']),
  publishTargets: z.array(PublishTargetSchema).default(['markdown_download']),
  blogPreferences: z
    .object({
      frontmatter: BlogFrontmatterPreferenceSchema.optional()
    })
    .optional(),
  referencePostSlugs: z.array(z.string()).optional()
});

export type DraftRequest = z.infer<typeof DraftRequestSchema>;

export const GeneratedDraftSchema = z.object({
  title: z.string().min(8),
  slug: BlogSlugSchema,
  body: z.string().min(50),
  tags: z.array(z.string()).min(1).nullable(),
  ingress: z.string().min(15).nullable(),
  category: z.string().min(1).nullable(),
  generationNotes: z.string(),
  sourcePostUsed: z.array(z.string())
});

export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;

export const createGeneratedDraftSchema = (frontmatter: BlogFrontmatterPreference = {}) =>
  z.object({
    title: z.string().min(8),
    slug: BlogSlugSchema,
    body: z.string().min(50),
    tags: frontmatter.tags ? z.array(z.string()).min(1) : z.array(z.string()).min(1).nullable(),
    ingress: frontmatter.ingress ? z.string().min(15) : z.string().min(15).nullable(),
    category: frontmatter.category ? z.string().min(1) : z.string().min(1).nullable(),
    generationNotes: z.string(),
    sourcePostUsed: z.array(z.string())
  });

export const GeneratedSocialVariantSchema = z.object({
  platform: z.enum(['x', 'linkedin']),
  body: z.string().min(20),
  generationNotes: z.string()
});

export type GeneratedSocialVariant = z.infer<typeof GeneratedSocialVariantSchema>;

export const DraftReviewSchema = z.object({
  status: z.enum(['draft', 'approved', 'rejected', 'published']),
  aiDraft: GeneratedDraftSchema,
  editedMarkdown: z.string().optional(),
  reviewerNotes: z.string().optional()
});

export type DraftReview = z.infer<typeof DraftReviewSchema>;
