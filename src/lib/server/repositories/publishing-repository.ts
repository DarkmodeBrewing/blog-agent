import { insertPostPublication, lockPostById, selectPostRowBySlug } from './content-repository';

export const selectPublishablePostRowBySlug = (slug: string) => {
  return selectPostRowBySlug(slug);
};

export const insertPublicationRecord = (values: Parameters<typeof insertPostPublication>[0]) => {
  insertPostPublication(values);
};

export const lockPublishedPostById = (postId: number) => {
  lockPostById(postId);
};
