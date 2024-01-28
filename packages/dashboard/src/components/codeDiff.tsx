import "react-diff-view/style/index.css";

import hash from "fnv1a";
import React from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";

import unifiedDiff, { UnifiedDiffParams } from "../lib/unifiedDiff";

export default function codeDiff(params: UnifiedDiffParams) {
  const diffText = unifiedDiff(params);
  const diff = parseDiff(diffText, { nearbySequences: "zip" });

  const renderFile: (
    file: ReturnType<typeof parseDiff>[0],
  ) => React.ReactNode = ({ oldRevision, newRevision, type, hunks }) => (
    <Diff
      key={`${oldRevision}-${newRevision}`}
      viewType="split"
      diffType={type}
      hunks={hunks}
    >
      {(diffedHunks) =>
        diffedHunks.map((hunk, i) => (
          <Hunk key={hash(hunk.content + i)} hunk={hunk} />
        ))
      }
    </Diff>
  );

  return <>{diff.map(renderFile)}</>;
}
