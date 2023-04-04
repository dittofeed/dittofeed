import { diffLines, formatLines } from "unidiff";

export default function unifiedDiff({
  oldText,
  newText,
  oldFileName,
  newFileName,
}) {
  return formatLines(diffLines(oldText, newText), {
    context: 3,
    aname: oldFileName,
    bname: newFileName,
  });
}
