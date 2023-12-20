import { Config } from "backend-lib/src/config";
import { Draft } from "immer";
import {
  BroadcastResource,
  ChannelType,
  DataSourceConfigurationResource,
  DefaultEmailProviderResource,
  DelayVariant,
  DelayVariantType,
  DFRequestContext,
  EntryNode,
  EphemeralRequestStatus,
  ExitNode,
  IntegrationResource,
  JourneyNodeType,
  JourneyResource,
  JourneyStats,
  JourneyStatsResponse,
  LocalTimeDelayVariant,
  MessageTemplateResource,
  PersistedEmailProvider,
  RequestStatus,
  SecondsDelayVariant,
  SecretAvailabilityResource,
  SecretResource,
  SegmentNode,
  SegmentNodeType,
  SegmentResource,
  SmsProviderConfig,
  SourceControlProviderEnum,
  SubscriptionGroupResource,
  UserPropertyDefinition,
  UserPropertyResource,
  WaitForNode,
  WorkspaceMemberResource,
  WorkspaceResource,
  WriteKeyResource,
} from "isomorphic-lib/src/types";
import {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  PreviewData,
} from "next";
import { ParsedUrlQuery } from "querystring";
import { Edge, EdgeChange, Node, NodeChange } from "reactflow";
import { Optional } from "utility-types";

export type PropsWithInitialState<T = object> = {
  serverInitialState: PreloadedState;
} & T;

export type PreloadedState = Partial<AppState>;

export type AppContents = AppState & AppActions;

export type GetDFServerSideProps<
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style, @typescript-eslint/no-explicit-any
  P extends { [key: string]: any } = { [key: string]: any },
  Q extends ParsedUrlQuery = ParsedUrlQuery,
  D extends PreviewData = PreviewData
> = (
  context: GetServerSidePropsContext<Q, D>,
  dfContext: DFRequestContext
) => Promise<GetServerSidePropsResult<P>>;

// README: properties get shallowly overridden when merging serverside state
// into the default client state, see lib/appStore.ts initializeStore. For that
// reason properties should not be nested in AppState.
export type AppState = {
  apiBase: string;
  dashboardUrl: string;
  workspace: RequestStatus<WorkspaceResource, Error>;
  member: WorkspaceMemberResource | null;
  drawerOpen: boolean;
  segments: RequestStatus<SegmentResource[], Error>;
  broadcasts: BroadcastResource[];
  subscriptionGroups: SubscriptionGroupResource[];
  userProperties: RequestStatus<UserPropertyResource[], Error>;
  messages: RequestStatus<MessageTemplateResource[], Error>;
  journeys: RequestStatus<JourneyResource[], Error>;
  traits: string[];
  getTraitsRequest: EphemeralRequestStatus<Error>;
  writeKeys: WriteKeyResource[];
  secrets: SecretResource[];
  secretAvailability: SecretAvailabilityResource[];
  defaultEmailProvider: DefaultEmailProviderResource | null;
  emailProviders: PersistedEmailProvider[];
  smsProviders: SmsProviderConfig[];
  dataSourceConfigurations: RequestStatus<
    DataSourceConfigurationResource[],
    Error
  >;
  integrations: IntegrationResource[];
  sourceControlProvider?: SourceControlProviderEnum;
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
  upsertSmsProvider: (smsProvider: SmsProviderConfig) => void;
  upsertDataSourceConfiguration: (
    dataSource: DataSourceConfigurationResource
  ) => void;
  upsertMessage: (message: MessageTemplateResource) => void;
  upsertBroadcast: (message: BroadcastResource) => void;
  deleteMessage: (id: string) => void;
  upsertSegment: (segment: SegmentResource) => void;
  deleteSegment: (segmentId: string) => void;
  upsertJourney: (journey: JourneyResource) => void;
  deleteJourney: (segmentId: string) => void;
  upsertSecrets: (secrets: SecretResource[]) => void;
  deleteSecret: (secretName: string) => void;
  upsertSubscriptionGroup: (
    subscriptionGroup: SubscriptionGroupResource
  ) => void;
  deleteSubscriptionGroup: (id: string) => void;
  upsertUserProperty: (userProperty: UserPropertyResource) => void;
  deleteUserProperty: (userPropertyId: string) => void;
  upsertIntegration: (integrations: IntegrationResource) => void;
  upsertTraits: (traits: string[]) => void;
  setGetTraitsRequest: (request: EphemeralRequestStatus<Error>) => void;
  setDefaultEmailProvider: (
    defaultEmailProvider: DefaultEmailProviderResource
  ) => void;
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
    request: EphemeralRequestStatus<Error>
  ) => void;
}

export interface UserPropertyEditorContent {
  editedUserProperty: UserPropertyResource | null;
  updateUserPropertyDefinition: (
    updater: (
      currentValue: Draft<UserPropertyDefinition>
    ) => Draft<UserPropertyDefinition>
  ) => void;
  userPropertyUpdateRequest: EphemeralRequestStatus<Error>;
  setUserPropertyUpdateRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
  setEditableUserPropertyName: (name: string) => void;
}

export interface JourneyIndexContent {
  journeyDeleteRequest: EphemeralRequestStatus<Error>;
  setJourneyDeleteRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface MessageTemplateIndexContent {
  messageTemplateDeleteRequest: EphemeralRequestStatus<Error>;
  setMessageTemplateDeleteRequest: (
    request: EphemeralRequestStatus<Error>
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
    request: EphemeralRequestStatus<Error>
  ) => void;
  setSubscriptionGroupDeleteRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
  updateEditedSubscriptionGroup: (
    broadcast: Partial<SubscriptionGroupResource>
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
    nodeType: SegmentNodeType
  ) => void;
  updateEditableSegmentNodeData: (
    nodeId: string,
    updater: (currentValue: Draft<SegmentNode>) => void
  ) => void;
  setSegmentUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface EmailMessageEditorState {
  emailMessageSubject: string;
  emailMessageFrom: string;
  emailMessageTitle: string;
  emailMessageBody: string;
  emailMessageReplyTo: string;
  emailMessageUserProperties: Record<string, string>;
  emailMessageUserPropertiesJSON: string;
  emailMessageUpdateRequest: EphemeralRequestStatus<Error>;
}

export interface EmailMessageEditorContents extends EmailMessageEditorState {
  setEmailMessageSubject: (subject: string) => void;
  setEmailMessageBody: (body: string) => void;
  setEmailMessageFrom: (to: string) => void;
  setEmailMessageReplyTo: (replyTo: string) => void;
  replaceEmailMessageProps: (properties: Record<string, string>) => void;
  setEmailMessagePropsJSON: (jsonString: string) => void;
  setEmailMessageTitle: (title: string) => void;
  setEmailMessageUpdateRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
}

export interface SmsMessageEditorState {
  smsMessageTitle: string;
  smsMessageBody: string;
  smsMessageUserProperties: Record<string, string>;
  smsMessageUserPropertiesJSON: string;
  smsMessageUpdateRequest: EphemeralRequestStatus<Error>;
}

export interface SmsMessageEditorContents extends SmsMessageEditorState {
  setSmsMessageTitle: (title: string) => void;
  setSmsMessageBody: (body: string) => void;
  setSmsUserProperties: (properties: Record<string, string>) => void;
  setSmsMessagePropsJSON: (jsonString: string) => void;
  setSmsMessageUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface MobilePushMessageEditorState {
  mobilePushMessageTitle: string;
  mobilePushMessageBody: string;
  mobilePushMesssageImageUrl: string;
  mobilePushMessageUserProperties: Record<string, string>;
  mobilePushMessageUserPropertiesJSON: string;
  mobilePushMessageUpdateRequest: EphemeralRequestStatus<Error>;
}

export interface MobilePushMessageEditorContents
  extends MobilePushMessageEditorState {
  setMobilePushMessageTitle: (title: string) => void;
  setMobilePushMessageBody: (body: string) => void;
  setMobilePushMessageImageUrl: (imageUrl: string) => void;
  setMobilePushMessagePropsJSON: (jsonString: string) => void;
  setMobilePushMessageUpdateRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
}

export interface JourneyState {
  journeyName: string;
  journeyDraggedComponentType: JourneyNodeType | null;
  journeySelectedNodeId: string | null;
  journeyNodes: Node<NodeData>[];
  journeyNodesIndex: Record<string, number>;
  journeyEdges: Edge<EdgeData>[];
  journeyUpdateRequest: EphemeralRequestStatus<Error>;
  journeyStats: Record<string, JourneyStats>;
  journeyStatsRequest: EphemeralRequestStatus<Error>;
}

export interface AddNodesParams {
  source: string;
  target: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export interface JourneyContent extends JourneyState {
  setDraggedComponentType: (t: JourneyNodeType | null) => void;
  setSelectedNodeId: (t: string | null) => void;
  addNodes: (params: AddNodesParams) => void;
  setEdges: (changes: EdgeChange[]) => void;
  setNodes: (changes: NodeChange[]) => void;
  deleteJourneyNode: (nodeId: string) => void;
  updateJourneyNodeData: (
    nodeId: string,
    updater: (currentValue: Draft<Node<JourneyNodeProps>>) => void
  ) => void;
  setJourneyUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
  setJourneyName: (name: string) => void;
  updateLabelNode: (nodeId: string, title: string) => void;
  setJourneyStatsRequest: (request: EphemeralRequestStatus<Error>) => void;
  upsertJourneyStats: (stats: JourneyStatsResponse) => void;
}

export type PageStoreContents = EmailMessageEditorContents &
  MobilePushMessageEditorContents &
  SmsMessageEditorContents &
  SegmentEditorContents &
  SegmentIndexContent &
  UserPropertyIndexContent &
  JourneyIndexContent &
  MessageTemplateIndexContent &
  UserPropertyEditorContent &
  JourneyContent &
  BroadcastEditorContents &
  SubscriptionGroupEditorContents;

export interface EntryNodeProps {
  type: JourneyNodeType.EntryNode;
  segmentId?: string;
}

export interface ExitNodeProps {
  type: JourneyNodeType.ExitNode;
}

export interface MessageNodeProps {
  type: JourneyNodeType.MessageNode;
  name: string;
  templateId?: string;
  channel: ChannelType;
  subscriptionGroupId?: string;
}

type UiDelayVariant<T, TD> = Partial<Omit<T, "type">> & {
  type: TD;
};

export interface DelayNodeProps {
  type: JourneyNodeType.DelayNode;
  variant:
    | UiDelayVariant<LocalTimeDelayVariant, DelayVariantType.LocalTime>
    | UiDelayVariant<SecondsDelayVariant, DelayVariantType.Second>;
}

export interface SegmentSplitNodeProps {
  type: JourneyNodeType.SegmentSplitNode;
  name: string;
  segmentId?: string;
  trueLabelNodeId: string;
  falseLabelNodeId: string;
}

export interface WaitForNodeProps {
  type: JourneyNodeType.WaitForNode;
  timeoutSeconds?: number;
  timeoutLabelNodeId: string;
  segmentChildren: {
    labelNodeId: string;
    segmentId?: string;
  }[];
}

export type NodeTypeProps =
  | EntryNodeProps
  | ExitNodeProps
  | MessageNodeProps
  | DelayNodeProps
  | SegmentSplitNodeProps
  | WaitForNodeProps;

export type JourneyNodePairing =
  | [EntryNodeProps, EntryNode]
  | [ExitNodeProps, ExitNode]
  | [MessageNodeProps, SegmentNode]
  | [DelayNodeProps, SegmentNode]
  | [SegmentSplitNodeProps, SegmentNode]
  | [WaitForNodeProps, WaitForNode];

export interface JourneyNodeProps {
  type: "JourneyNode";
  nodeTypeProps: NodeTypeProps;
}

export interface EmptyNodeProps {
  type: "EmptyNode";
}

export interface LabelNodeProps {
  type: "LabelNode";
  title: string;
}

export type TimeUnit = "seconds" | "minutes" | "hours" | "days" | "weeks";

export type NonJourneyNodeData = LabelNodeProps | EmptyNodeProps;

export type NodeData = JourneyNodeProps | NonJourneyNodeData;

export interface WorkflowEdgeProps {
  type: "WorkflowEdge";
  disableMarker?: boolean;
}

export interface PlaceholderEdgeProps {
  type: "PlaceholderEdge";
}

export type EdgeData = WorkflowEdgeProps | PlaceholderEdgeProps;

export interface GroupedOption<T> {
  id: T;
  group: string;
  label: string;
  disabled?: boolean;
}
