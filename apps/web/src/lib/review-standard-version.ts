export type ReviewStandardVersion = { id: string; colorId: string; versionNo: number; boardCode: string | null };
export type ReviewStandardOptions = {
  standardVersionRequired?: boolean;
  eligibleStandardVersions?: ReviewStandardVersion[];
  standardVersionsHasMore?: boolean;
};
export function reviewStandardLabel(version: ReviewStandardVersion | null | undefined) {
  return version ? `${version.boardCode || '未编色板号'} · 标准 v${version.versionNo}` : '历史记录未关联标准版本';
}
