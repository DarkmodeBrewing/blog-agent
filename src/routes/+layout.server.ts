import type { LayoutServerLoad } from './$types';
import { getReadiness } from '$lib/server/app-settings';

export const load: LayoutServerLoad = () => {
  return {
    readiness: getReadiness()
  };
};
