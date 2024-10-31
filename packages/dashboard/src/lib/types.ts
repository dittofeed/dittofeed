import { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import { Config } from "backend-lib/src/config";
import { Draft } from "immer";
import {
  AdditionalJourneyNodeType,
  AdminApiKeyResource,
  BroadcastResource,
  ChannelType,
  DataSourceConfigurationResource,
  DefaultEmailProviderResource,
  DefaultSmsProviderResource,
  DelayUiNodeProps,
  DelayUiNodeVariant,
  DFRequestContext,
  EntryUiNodeProps,
  EntryUiNodeVariant,
  EphemeralRequestStatus,
  ExitUiNodeProps,
  FeatureMap,
  GetPropertiesResponse,
  IntegrationResource,
  JourneyNodeUiProps,
  JourneyStats,
  JourneyStatsResponse,
  JourneyUiBodyNodeTypeProps,
  JourneyUiDefinitionEdgeProps,
  JourneyUiDraftEdge,
  JourneyUiDraftNode,
  JourneyUiEdgeProps,
  JourneyUiEdgeType,
  JourneyUiNodeDefinitionProps,
  JourneyUiNodeEmptyProps,
  JourneyUiNodeLabelProps,
  JourneyUiNodePairing,
  JourneyUiNodePresentationalProps,
  JourneyUiNodeType,
  JourneyUiNodeTypeProps,
  JourneyUiPlaceholderEdgeProps,
  MessageTemplateResource,
  MessageUiNodeProps,
  PartialSegmentResource,
  PersistedEmailProvider,
  PersistedSmsProvider,
  RequestStatus,
  SavedJourneyResource,
  SavedSubscriptionGroupResource,
  SecretAvailabilityResource,
  SecretResource,
  SegmentNode,
  SegmentNodeType,
  SegmentResource,
  SegmentSplitUiNodeProps,
  SourceControlProviderEnum,
  SubscriptionGroupResource,
  TimeUnit,
  UserPropertyDefinition,
  UserPropertyResource,
  WaitForUiNodeProps,
  WorkspaceMemberResource,
  WorkspaceMemberRoleResource,
  WorkspaceResource,
  WriteKeyResource,
} from "isomorphic-lib/src/types";
import {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  PreviewData,
} from "next";
import { ParsedUrlQuery } from "querystring";
import { Optional } from "utility-types";

// re-exporting for convenience
export {
  AdditionalJourneyNodeType,
  type DelayUiNodeProps,
  type DelayUiNodeVariant,
  type EntryUiNodeProps,
  type EntryUiNodeVariant,
  type ExitUiNodeProps,
  type JourneyNodeUiProps,
  type JourneyUiDefinitionEdgeProps,
  type JourneyUiDraftEdge,
  type JourneyUiDraftNode,
  type JourneyUiEdgeProps,
  JourneyUiEdgeType,
  type JourneyUiNodeDefinitionProps,
  type JourneyUiNodeEmptyProps,
  type JourneyUiNodeLabelProps,
  type JourneyUiNodePairing,
  type JourneyUiNodePresentationalProps,
  JourneyUiNodeType,
  type JourneyUiNodeTypeProps,
  type JourneyUiPlaceholderEdgeProps,
  type MessageUiNodeProps,
  type SegmentSplitUiNodeProps,
  TimeUnit,
  type WaitForUiNodeProps,
};

export type PropsWithInitialState<T = object> = {
  serverInitialState: PreloadedState;
} & T;

export type PreloadedState = Partial<AppState>;

export type AppContents = AppState & AppActions;

export type DashboardContext = DFRequestContext & { features: FeatureMap };

export type GetDFServerSideProps<
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style, @typescript-eslint/no-explicit-any
  P extends { [key: string]: any } = { [key: string]: any },
  Q extends ParsedUrlQuery = ParsedUrlQuery,
  D extends PreviewData = PreviewData,
> = (
  context: GetServerSidePropsContext<Q, D>,
  dfContext: DashboardContext,
) => Promise<GetServerSidePropsResult<P>>;

export type UserPropertyMessages = Record<
  string,
  Record<
    string,
    {
      name: string;
      type: ChannelType;
    }
  >
>;

// README: properties get shallowly overridden when merging serverside state
// into the default client state, see lib/appStore.ts initializeStore. For that
// reason properties should not be nested in AppState.
export type AppState = {
  apiBase: string;
  dashboardUrl: string;
  features: FeatureMap;
  workspace: RequestStatus<WorkspaceResource, Error>;
  member: WorkspaceMemberResource | null;
  memberRoles: WorkspaceMemberRoleResource[];
  drawerOpen: boolean;
  segments: RequestStatus<PartialSegmentResource[], Error>;
  broadcasts: BroadcastResource[];
  subscriptionGroups: SavedSubscriptionGroupResource[];
  userProperties: RequestStatus<UserPropertyResource[], Error>;
  messages: RequestStatus<MessageTemplateResource[], Error>;
  userPropertyMessages: UserPropertyMessages;
  journeys: RequestStatus<SavedJourneyResource[], Error>;
  traits: string[];
  properties: GetPropertiesResponse["properties"];
  getTraitsRequest: EphemeralRequestStatus<Error>;
  getPropertiesRequest: EphemeralRequestStatus<Error>;
  writeKeys: WriteKeyResource[];
  secrets: SecretResource[];
  adminApiKeys?: AdminApiKeyResource[];
  secretAvailability: SecretAvailabilityResource[];
  defaultEmailProvider: DefaultEmailProviderResource | null;
  emailProviders: PersistedEmailProvider[];
  defaultSmsProvider: DefaultSmsProviderResource | null;
  smsProviders: PersistedSmsProvider[];
  dataSourceConfigurations: RequestStatus<
    DataSourceConfigurationResource[],
    Error
  >;
  integrations: IntegrationResource[];
  sourceControlProvider?: SourceControlProviderEnum;
  viewDraft: boolean;
  inTransition?: boolean;
} & PageStoreContents &
  Pick<
    Config,
    | "trackDashboard"
    | "dashboardWriteKey"
    | "enableSourceControl"
    | "sourceControlProvider"
    | "enableMobilePush"
  > &
  Partial<Pick<Config, "signoutUrl">>;

export interface AppActions {
  toggleDrawer: () => void;
  upsertEmailProvider: (emailProvider: PersistedEmailProvider) => void;
  upsertSmsProvider: (response: PersistedSmsProvider) => void;
  upsertDataSourceConfiguration: (
    dataSource: DataSourceConfigurationResource,
  ) => void;
  upsertTemplate: (message: MessageTemplateResource) => void;
  upsertBroadcast: (message: BroadcastResource) => void;
  deleteMessage: (id: string) => void;
  upsertSegment: (segment: PartialSegmentResource) => void;
  deleteSegment: (segmentId: string) => void;
  upsertJourney: (journey: SavedJourneyResource) => void;
  deleteJourney: (segmentId: string) => void;
  upsertSecrets: (secrets: SecretResource[]) => void;
  deleteSecret: (secretName: string) => void;
  upsertSubscriptionGroup: (
    subscriptionGroup: SavedSubscriptionGroupResource,
  ) => void;
  deleteSubscriptionGroup: (id: string) => void;
  upsertUserProperty: (userProperty: UserPropertyResource) => void;
  deleteUserProperty: (userPropertyId: string) => void;
  upsertIntegration: (integrations: IntegrationResource) => void;
  upsertTraits: (traits: string[]) => void;
  upsertProperties: (properties: GetPropertiesResponse["properties"]) => void;
  setGetTraitsRequest: (request: EphemeralRequestStatus<Error>) => void;
  setGetPropertiesRequest: (request: EphemeralRequestStatus<Error>) => void;
  setDefaultEmailProvider: (
    defaultEmailProvider: DefaultEmailProviderResource,
  ) => void;
  setDefaultSmsProvider: (
    defaultSmsProvider: DefaultSmsProviderResource,
  ) => void;
  setViewDraft: (viewDraft: boolean) => void;
  upsertAdminApiKey: (apiKey: AdminApiKeyResource) => void;
  deleteAdminApiKey: (id: string) => void;
  patchSecretAvailability: (secret: {
    workspaceId: string;
    name: string;
    key: string;
    value: boolean;
  }) => void;
}

export interface SegmentIndexContent {
  segmentDeleteRequest: EphemeralRequestStatus<Error>;
  setSegmentDeleteRequest: (request: EphemeralRequestStatus<Error>) => void;
  segmentDownloadRequest: EphemeralRequestStatus<Error>;
  setSegmentDownloadRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface UserPropertyIndexContent {
  userPropertyDeleteRequest: EphemeralRequestStatus<Error>;
  setUserPropertyDeleteRequest: (
    request: EphemeralRequestStatus<Error>,
  ) => void;
}

export interface UserPropertyEditorContent {
  editedUserProperty: UserPropertyResource | null;
  updateUserPropertyDefinition: (
    updater: (
      currentValue: Draft<UserPropertyDefinition>,
    ) => Draft<UserPropertyDefinition>,
  ) => void;
  userPropertyUpdateRequest: EphemeralRequestStatus<Error>;
  setUserPropertyUpdateRequest: (
    request: EphemeralRequestStatus<Error>,
  ) => void;
  updateEditedUserProperty: (
    userProperty: Partial<Omit<UserPropertyResource, "id" | "workspaceId">>,
  ) => void;
}

export interface JourneyIndexContent {
  journeyDeleteRequest: EphemeralRequestStatus<Error>;
  setJourneyDeleteRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface UserIndexContent {
  userDeleteRequest: EphemeralRequestStatus<Error>;
  setUserDeleteRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface MessageTemplateIndexContent {
  messageTemplateDeleteRequest: EphemeralRequestStatus<Error>;
  setMessageTemplateDeleteRequest: (
    request: EphemeralRequestStatus<Error>,
  ) => void;
}

export type EditedBroadcast = Optional<
  BroadcastResource,
  "segmentId" | "triggeredAt" | "createdAt"
>;

export interface BroadcastEditorContents {
  editedBroadcast: EditedBroadcast | null;
  broadcastUpdateRequest: EphemeralRequestStatus<Error>;
  broadcastTriggerRequest: EphemeralRequestStatus<Error>;
  setBroadcastUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
  setBroadcastTriggerRequest: (request: EphemeralRequestStatus<Error>) => void;
  updateEditedBroadcast: (broadcast: Partial<BroadcastResource>) => void;
}

export interface SubscriptionGroupEditorContents {
  editedSubscriptionGroup: SubscriptionGroupResource | null;
  subscriptionGroupUpdateRequest: EphemeralRequestStatus<Error>;
  subscriptionGroupDeleteRequest: EphemeralRequestStatus<Error>;
  setSubscriptionGroupUpdateRequest: (
    request: EphemeralRequestStatus<Error>,
  ) => void;
  setSubscriptionGroupDeleteRequest: (
    request: EphemeralRequestStatus<Error>,
  ) => void;
  updateEditedSubscriptionGroup: (
    broadcast: Partial<SubscriptionGroupResource>,
  ) => void;
}

export interface SegmentEditorState {
  editedSegment: SegmentResource | null;
  segmentUpdateRequest: EphemeralRequestStatus<Error>;
}

export interface SegmentEditorContents extends SegmentEditorState {
  setEditableSegmentName: (name: string) => void;
  addEditableSegmentChild: (parentId: string) => void;
  removeEditableSegmentChild: (parentId: string, nodeId: string) => void;
  updateEditableSegmentNodeType: (
    nodeId: string,
    nodeType: SegmentNodeType,
  ) => void;
  updateEditableSegmentNodeData: (
    nodeId: string,
    updater: (currentValue: Draft<SegmentNode>) => void,
  ) => void;
  setSegmentUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export type JourneyNodesIndex = Record<string, number>;

export type JourneyUiNode = Node<JourneyNodeUiProps, "journey">;
export type JourneyUiEdge = Edge<JourneyUiEdgeProps, "workflow">;
export interface JourneyState {
  journeyName: string;
  journeyDraggedComponentType: JourneyUiBodyNodeTypeProps["type"] | null;
  journeySelectedNodeId: string | null;
  journeyNodes: JourneyUiNode[];
  journeyEdges: JourneyUiEdge[];
  journeyNodesIndex: JourneyNodesIndex;
  journeyUpdateRequest: EphemeralRequestStatus<Error>;
  journeyStats: Record<string, JourneyStats>;
  journeyStatsRequest: EphemeralRequestStatus<Error>;
}

export interface AddNodesParams {
  source: string;
  target: string;
  nodes: JourneyUiNode[];
  edges: JourneyUiEdge[];
}

export interface JourneyContent extends JourneyState {
  setDraggedComponentType: (
    t: JourneyUiBodyNodeTypeProps["type"] | null,
  ) => void;
  setSelectedNodeId: (t: string | null) => void;
  addNodes: (params: AddNodesParams) => void;
  setEdges: (changes: EdgeChange<JourneyUiEdge>[]) => void;
  setNodes: (changes: NodeChange<JourneyUiNode>[]) => void;
  deleteJourneyNode: (nodeId: string) => void;
  updateJourneyNodeData: (
    nodeId: string,
    updater: (currentValue: Draft<Node<JourneyUiNodeDefinitionProps>>) => void,
  ) => void;
  setJourneyUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
  setJourneyName: (name: string) => void;
  updateLabelNode: (nodeId: string, title: string) => void;
  setJourneyStatsRequest: (request: EphemeralRequestStatus<Error>) => void;
  upsertJourneyStats: (stats: JourneyStatsResponse) => void;
  resetJourneyState: (state: {
    edges: JourneyUiEdge[];
    nodes: JourneyUiNode[];
    index: JourneyNodesIndex;
  }) => void;
}

export type PageStoreContents = SegmentEditorContents &
  SegmentIndexContent &
  UserPropertyIndexContent &
  JourneyIndexContent &
  UserIndexContent &
  MessageTemplateIndexContent &
  UserPropertyEditorContent &
  JourneyContent &
  BroadcastEditorContents &
  SubscriptionGroupEditorContents;

export interface GroupedOption<T> {
  id: T;
  group: string;
  label: string;
  disabled?: boolean;
}

export interface EventResources {
  name: string;
  link: string;
  key: string;
}

export type JourneyUiNodeLabel = Node<
  JourneyUiNodeLabelProps,
  "JourneyUiNodeLabel"
>;

export type JourneyUiNodeDefinition = Node<
  JourneyUiNodeDefinitionProps,
  "JourneyUiNodeDefinition"
>;
