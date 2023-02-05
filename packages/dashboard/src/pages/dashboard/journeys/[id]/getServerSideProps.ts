import backendConfig from "backend-lib/src/config";
import {
  CompletionStatus,
  MessageTemplateResource,
  TemplateResourceType,
} from "isomorphic-lib/src/types";
import { Result } from "neverthrow";
import { GetServerSideProps } from "next";
import { validate } from "uuid";

import { journeyToState } from "../../../../components/journeys/store";
import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
} from "../../../../lib/appStore";
import prisma from "../../../../lib/prisma";

export type JourneyGetServerSideProps =
  GetServerSideProps<PropsWithInitialState>;

export const journeyGetServerSideProps: JourneyGetServerSideProps = async (
  ctx
) => {
  // Dynamically import to avoid transitively importing backend config at build time.
  const [{ toJourneyResource }, { toSegmentResource }] = await Promise.all([
    import("backend-lib/src/journeys"),
    import("backend-lib/src/segments"),
  ]);

  const workspaceId = backendConfig().defaultWorkspaceId;
  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }

  const [journey, workspace, segments, emailTemplates] = await Promise.all([
    await prisma().journey.findUnique({
      where: { id },
    }),
    prisma().workspace.findUnique({
      where: { id: workspaceId },
    }),
    prisma().segment.findMany({
      where: { workspaceId },
    }),
    prisma().emailTemplate.findMany({
      where: { workspaceId },
    }),
  ]);

  const templateResources: MessageTemplateResource[] = emailTemplates.map(
    ({
      workspaceId: templateWorkspaceId,
      id: templateId,
      name,
      from,
      subject,
      body,
    }) => ({
      type: TemplateResourceType.Email,
      workspaceId: templateWorkspaceId,
      id: templateId,
      name,
      from,
      subject,
      body,
    })
  );

  const serverInitialState: PreloadedState = {
    messages: {
      type: CompletionStatus.Successful,
      value: templateResources,
    },
  };

  const journeyResourceResult = journey && toJourneyResource(journey);
  if (journeyResourceResult?.isOk()) {
    const journeyResource = journeyResourceResult.value;
    serverInitialState.journeys = {
      type: CompletionStatus.Successful,
      value: [journeyResource],
    };
    const stateFromJourney = journeyToState(journeyResource);
    Object.assign(serverInitialState, stateFromJourney);
  } else {
    serverInitialState.journeyName = `New Journey - ${id}`;
  }

  const segmentResourceResult = Result.combine(segments.map(toSegmentResource));

  if (segmentResourceResult.isOk()) {
    const segmentResource = segmentResourceResult.value;
    serverInitialState.segments = {
      type: CompletionStatus.Successful,
      value: segmentResource,
    };
  }

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

  const props = addInitialStateToProps({}, serverInitialState);

  return {
    props,
  };
};
