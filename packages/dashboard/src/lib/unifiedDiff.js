import { diffLines, formatLines } from "unidiff";

export default function unifiedDiff({ oldText, newText }) {
  return formatLines(diffLines(oldText, newText), { context: 3 });
}
