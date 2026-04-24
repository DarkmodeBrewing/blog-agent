import { insertPostPublication, lockPostById, selectPostRowBySlug } from './content-repository';

const toSqliteTimestamp = (date = new Date()) => date.toISOString().slice(0, 19).replace('T', ' ');

export const selectPublishablePostRowBySlug = (slug: string) => {
  return selectPostRowBySlug(slug);
};

export const insertPublicationRecord = (values: Parameters<typeof insertPostPublication>[0]) => {
  insertPostPublication({
    ...values,
    publishedAt: values.status === 'published' ? toSqliteTimestamp() : (values.publishedAt ?? null),
    updatedAt: toSqliteTimestamp()
  });
};

export const lockPublishedPostById = (postId: number) => {
  lockPostById(postId);
};
