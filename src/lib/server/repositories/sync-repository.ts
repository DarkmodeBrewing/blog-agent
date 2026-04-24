import { selectPostRowBySlug, upsertPostRow } from './content-repository';

export const selectSyncedPostRowBySlug = (slug: string) => {
  return selectPostRowBySlug(slug);
};

export const upsertSyncedPostRow = (values: Parameters<typeof upsertPostRow>[0]) => {
  return upsertPostRow(values);
};
