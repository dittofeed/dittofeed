import backendConfig from "backend-lib/src/config";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
} from "../../../../lib/appStore";
import prisma from "../../../../lib/prisma";

const entryId = "entry";
const initTraitId = "initTraitId";

const getSegmentServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async (ctx) => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  const serverInitialState: PreloadedState = {};

  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }

  const [segment, workspace, traits] = await Promise.all([
    prisma().segment.findUnique({
      where: {
        id,
      },
    }),
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    findAllUserTraits({
      workspaceId,
    }),
  ]);

  let segmentResource: SegmentResource;
  if (segment) {
    const segmentDefinition = unwrap(
      schemaValidate(segment.definition, SegmentDefinition)
    );
    segmentResource = {
      id: segment.id,
      name: segment.name,
      workspaceId,
      definition: segmentDefinition,
    };

    serverInitialState.segments = {
      type: CompletionStatus.Successful,
      value: [segmentResource],
    };
  } else {
    segmentResource = {
      name: "My Segment",
      id,
      workspaceId,
      definition: {
        entryNode: {
          type: SegmentNodeType.And,
          children: [initTraitId],
          id: entryId,
        },
        nodes: [
          {
            type: SegmentNodeType.Trait,
            id: initTraitId,
            path: "",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "",
            },
          },
        ],
      },
    };
  }
  serverInitialState.editedSegment = segmentResource;

  if (workspace) {
    // TODO PLI-212
    serverInitialState.workspace = {
      type: CompletionStatus.Successful,
      value: {
        id: workspaceId,
        name: workspace.name,
      },
    };
  }

  serverInitialState.traits = {
    type: CompletionStatus.Successful,
    value: traits,
  };

  return {
    props: addInitialStateToProps({}, serverInitialState),
  };
};

export default getSegmentServerSideProps;
