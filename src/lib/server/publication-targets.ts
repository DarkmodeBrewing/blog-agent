import type { PublishTarget } from './post-library';

export type PublishTargetKind = 'export' | 'live_publication';

const exportTargets = new Set<PublishTarget>(['markdown_download', 'markdown_disk_export']);

export const getPublishTargetKind = (target: PublishTarget): PublishTargetKind => {
  return exportTargets.has(target) ? 'export' : 'live_publication';
};

export const isExportTarget = (target: PublishTarget) => getPublishTargetKind(target) === 'export';

export const isLivePublicationTarget = (target: PublishTarget) =>
  getPublishTargetKind(target) === 'live_publication';
