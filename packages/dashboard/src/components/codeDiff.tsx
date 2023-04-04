import "react-diff-view/style/index.css";

import React from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";

import unifiedDiff, { UnifiedDiffParams } from "../lib/unifiedDiff";

export default function codeDiff(params: UnifiedDiffParams) {
  const diffText = unifiedDiff(params);
  const diff = parseDiff(diffText, { nearbySequences: "zip" });

  const renderFile: (
    file: ReturnType<typeof parseDiff>[0]
  ) => React.ReactNode = ({ oldRevision, newRevision, type, hunks }) => (
    <Diff
      key={`${oldRevision}-${newRevision}`}
      viewType="split"
      diffType={type}
      hunks={hunks}
    >
      {(diffedHunks) =>
        diffedHunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
      }
    </Diff>
  );

  return <>{diff.map(renderFile)}</>;
}
