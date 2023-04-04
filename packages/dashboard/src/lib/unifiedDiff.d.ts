export default function unifiedDiff(params: UnifiedDiffParams): string;

export interface UnifiedDiffParams {
  oldText: string;
  newText: string;
  oldFileName?: string;
  newFileName?: string;
}
