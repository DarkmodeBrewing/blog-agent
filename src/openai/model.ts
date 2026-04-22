import { z } from 'zod/v4';

export const BlogLengthSchema = z.enum(['short', 'medium', 'long']);
export const BlogSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+$/);

export const DraftRequestSchema = z.object({
  topic: z.string().min(10),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  desiredLength: BlogLengthSchema,
  referencePostSlugs: z.array(z.string()).optional()
});

export type DraftRequest = z.infer<typeof DraftRequestSchema>;

export const GeneratedDraftSchema = z.object({
  title: z.string().min(8),
  slug: BlogSlugSchema,
  tags: z.array(z.string()).min(1),
  body: z.string().min(50),
  ingress: z.string().min(15),
  generationNotes: z.string(),
  sourcePostUsed: z.array(z.string())
});

export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;

export const DraftReviewSchema = z.object({
  status: z.enum(['draft', 'approved', 'rejected', 'published']),
  aiDraft: GeneratedDraftSchema,
  editedMarkdown: z.string().optional(),
  reviewerNotes: z.string().optional()
});

export type DraftReview = z.infer<typeof DraftReviewSchema>;
