import { eq } from 'drizzle-orm';
import { getDatabase } from '../database';
import { appSettings } from '../db/schema';

export const getSettingValue = (key: string) => {
  return getDatabase()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get()?.value;
};

export const setSettingValue = (key: string, value: string) => {
  getDatabase()
    .insert(appSettings)
    .values({
      key,
      value,
      updatedAt: new Date().toISOString()
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: new Date().toISOString()
      }
    })
    .run();
};
