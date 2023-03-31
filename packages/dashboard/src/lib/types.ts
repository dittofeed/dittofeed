import { Draft } from "immer";
import {
  DataSourceConfigurationResource,
  DefaultEmailProviderResource,
  EphemeralRequestStatus,
  JourneyNodeType,
  JourneyResource,
  MessageTemplateResource,
  PersistedEmailProvider,
  RequestStatus,
  SegmentNode,
  SegmentNodeType,
  SegmentResource,
  UserPropertyDefinition,
  UserPropertyResource,
  WorkspaceResource,
} from "isomorphic-lib/src/types";
import { Edge, EdgeChange, Node, NodeChange } from "reactflow";

// README: properties get shallowly overridden when merging serverside state
// into the default client state, see lib/appStore.ts initializeStore. For that
// reason properties should not be nested in AppState.
export type AppState = {
  apiBase: string;
  workspace: RequestStatus<WorkspaceResource, Error>;
  drawerOpen: boolean;
  segments: RequestStatus<SegmentResource[], Error>;
  userProperties: RequestStatus<UserPropertyResource[], Error>;
  messages: RequestStatus<MessageTemplateResource[], Error>;
  journeys: RequestStatus<JourneyResource[], Error>;
  traits: RequestStatus<string[], Error>;
  defaultEmailProvider: RequestStatus<
    DefaultEmailProviderResource | null,
    Error
  >;
  emailProviders: RequestStatus<PersistedEmailProvider[], Error>;
  dataSourceConfigurations: RequestStatus<
    DataSourceConfigurationResource[],
    Error
  >;
} & PageStoreContents;

export interface AppActions {
  toggleDrawer: () => void;
  upsertEmailProvider: (emailProvider: PersistedEmailProvider) => void;
  upsertDataSourceConfiguration: (
    dataSource: DataSourceConfigurationResource
  ) => void;
  upsertMessage: (message: MessageTemplateResource) => void;
  deleteMessage: (id: string) => void;
  upsertSegment: (segment: SegmentResource) => void;
  deleteSegment: (segmentId: string) => void;
  upsertJourney: (journey: JourneyResource) => void;
  deleteJourney: (segmentId: string) => void;
  upsertUserProperty: (userProperty: UserPropertyResource) => void;
  deleteUserProperty: (userPropertyId: string) => void;
}

export interface SegmentIndexContent {
  segmentDeleteRequest: EphemeralRequestStatus<Error>;
  setSegmentDeleteRequest: (request: EphemeralRequestStatus<Error>) => void;
}

export interface UserPropertyIndexContent {
  userPropertyDeleteRequest: EphemeralRequestStatus<Error>;
  setUserPropertyDeleteRequest: (
    request: EphemeralRequestStatus<Error>
  ) => void;
}

export interface UserPropertyEditorContent {
  editedUserProperty: UserPropertyResource | null;
  updateUserPropertyDefinition: (definition: UserPropertyDefinition) => void;
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
  emailMessageUserProperties: Record<string, string>;
  emailMessageUserPropertiesJSON: string;
  emailMessageUpdateRequest: EphemeralRequestStatus<Error>;
}

export interface EmailMessageEditorContents extends EmailMessageEditorState {
  setEmailMessageSubject: (subject: string) => void;
  setEmailMessageBody: (body: string) => void;
  setEmailMessageFrom: (to: string) => void;
  replaceEmailMessageProps: (properties: Record<string, string>) => void;
  setEmailMessagePropsJSON: (jsonString: string) => void;
  setEmailMessageProps: (title: string) => void;
  setEmailMessageUpdateRequest: (
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
}

export interface JourneyContent extends JourneyState {
  setDraggedComponentType: (t: JourneyNodeType | null) => void;
  setSelectedNodeId: (t: string | null) => void;
  addNodes: (params: {
    source: string;
    target: string;
    nodes: Node<NodeData>[];
    edges: Edge[];
  }) => void;
  setEdges: (changes: EdgeChange[]) => void;
  setNodes: (changes: NodeChange[]) => void;
  deleteNode: (nodeId: string) => void;
  updateJourneyNodeData: (
    nodeId: string,
    updater: (currentValue: Draft<Node<JourneyNodeProps>>) => void
  ) => void;
  setJourneyUpdateRequest: (request: EphemeralRequestStatus<Error>) => void;
  setJourneyName: (name: string) => void;
}

export type PageStoreContents = EmailMessageEditorContents &
  SegmentEditorContents &
  SegmentIndexContent &
  UserPropertyIndexContent &
  JourneyIndexContent &
  MessageTemplateIndexContent &
  UserPropertyEditorContent &
  JourneyContent;

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
}
export interface DelayNodeProps {
  type: JourneyNodeType.DelayNode;
  seconds?: number;
}

export interface SegmentSplitNodeProps {
  type: JourneyNodeType.SegmentSplitNode;
  name: string;
  segmentId?: string;
  trueLabelNodeId: string;
  falseLabelNodeId: string;
}

export type NodeTypeProps =
  | EntryNodeProps
  | ExitNodeProps
  | MessageNodeProps
  | DelayNodeProps
  | SegmentSplitNodeProps;

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

export type NodeData = JourneyNodeProps | LabelNodeProps | EmptyNodeProps;

export interface WorkflowEdgeProps {
  type: "WorkflowEdge";
  disableMarker?: boolean;
}

export interface PlaceholderEdgeProps {
  type: "PlaceholderEdge";
}

export type EdgeData = WorkflowEdgeProps | PlaceholderEdgeProps;
