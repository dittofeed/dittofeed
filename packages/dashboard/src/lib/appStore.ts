import {
  CompletionStatus,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
} from "isomorphic-lib/src/types";
import { useLayoutEffect } from "react";
import { v4 as uuid } from "uuid";
import { create, UseBoundStore } from "zustand";
import createContext from "zustand/context";
import { immer } from "zustand/middleware/immer";

import { createJourneySlice } from "../components/journeys/store";
import { AppActions, AppState } from "./types";

// TODO migrate away from deprecreated createContext method
const zustandContext = createContext<UseStoreState>();
export const { Provider } = zustandContext;
export const useAppStore = zustandContext.useStore;

export type PreloadedState = Partial<AppState>;

type AppContents = AppState & AppActions;

function mapNodeToNewType(
  node: SegmentNode,
  type: SegmentNodeType
): { primary: SegmentNode; secondary: SegmentNode[] } {
  switch (type) {
    case SegmentNodeType.And: {
      let children: string[];
      let secondary: SegmentNode[];

      if (node.type === SegmentNodeType.Or) {
        children = node.children;
        secondary = [];
      } else {
        const child: SegmentNode = {
          type: SegmentNodeType.Trait,
          id: uuid(),
          path: "",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "",
          },
        };

        children = [child.id];
        secondary = [child];
      }

      return {
        primary: {
          type: SegmentNodeType.And,
          id: node.id,
          children,
        },
        secondary,
      };
    }
    case SegmentNodeType.Or: {
      let children: string[];
      let secondary: SegmentNode[];

      if (node.type === SegmentNodeType.And) {
        children = node.children;
        secondary = [];
      } else {
        const child: SegmentNode = {
          type: SegmentNodeType.Trait,
          id: uuid(),
          path: "",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "",
          },
        };

        children = [child.id];
        secondary = [child];
      }

      return {
        primary: {
          type: SegmentNodeType.Or,
          id: node.id,
          children,
        },
        secondary,
      };
    }
    case SegmentNodeType.Trait: {
      return {
        primary: {
          type: SegmentNodeType.Trait,
          id: node.id,
          path: "",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "",
          },
        },
        secondary: [],
      };
    }
  }
}

export const initializeStore = (preloadedState: PreloadedState = {}) =>
  create(
    immer<AppContents>((set, ...remaining) => {
      const appContents: AppContents = {
        apiBase: "",
        workspace: {
          type: CompletionStatus.NotStarted,
        },
        dataSourceConfigurations: {
          type: CompletionStatus.NotStarted,
        },
        defaultEmailProvider: {
          type: CompletionStatus.NotStarted,
        },
        drawerOpen: true,
        emailProviders: {
          type: CompletionStatus.NotStarted,
        },
        traits: {
          type: CompletionStatus.NotStarted,
        },
        messages: {
          type: CompletionStatus.NotStarted,
        },
        segments: {
          type: CompletionStatus.NotStarted,
        },
        journeys: {
          type: CompletionStatus.NotStarted,
        },

        // email message state
        emailMessageBody: "",
        emailMessageTitle: "",
        emailMessageSubject: "",
        emailMessageFrom: "",
        emailMessageUserProperties: {},
        emailMessageUserPropertiesJSON: "",
        emailMessageUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },

        // segment update view,
        editedSegment: null,
        segmentUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },

        toggleDrawer: () =>
          set((state) => {
            state.drawerOpen = !state.drawerOpen;
          }),
        upsertMessage: (message) =>
          set((state) => {
            let { messages } = state;
            if (messages.type !== CompletionStatus.Successful) {
              messages = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.messages = messages;
            }
            for (const existingMessage of messages.value) {
              if (message.id === existingMessage.id) {
                Object.assign(existingMessage, message);
                return state;
              }
            }
            messages.value.push(message);
            return state;
          }),
        upsertSegment: (segment) =>
          set((state) => {
            let { segments } = state;
            if (segments.type !== CompletionStatus.Successful) {
              segments = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.segments = segments;
            }
            for (const existing of segments.value) {
              if (segment.id === existing.id) {
                Object.assign(existing, segment);
                return state;
              }
            }
            segments.value.push(segment);
            return state;
          }),
        upsertEmailProvider: (emailProvider) =>
          set((state) => {
            let { emailProviders } = state;

            if (emailProviders.type !== CompletionStatus.Successful) {
              emailProviders = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.emailProviders = emailProviders;
            }

            for (const existingProvider of emailProviders.value) {
              if (emailProvider.id === existingProvider.id) {
                Object.assign(existingProvider, emailProvider);
                return state;
              }
            }
            emailProviders.value.push(emailProvider);
            return state;
          }),
        upsertDataSourceConfiguration: (dataSourceConfiguration) =>
          set((state) => {
            let { dataSourceConfigurations } = state;

            if (dataSourceConfigurations.type !== CompletionStatus.Successful) {
              dataSourceConfigurations = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.dataSourceConfigurations = dataSourceConfigurations;
            }

            for (const existingProvider of dataSourceConfigurations.value) {
              if (dataSourceConfiguration.id === existingProvider.id) {
                Object.assign(existingProvider, dataSourceConfiguration);
                return state;
              }
            }
            dataSourceConfigurations.value.push(dataSourceConfiguration);
            return state;
          }),
        upsertJourney: (journey) =>
          set((state) => {
            let { journeys } = state;
            if (journeys.type !== CompletionStatus.Successful) {
              journeys = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.journeys = journeys;
            }
            for (const existing of journeys.value) {
              if (journey.id === existing.id) {
                Object.assign(existing, journey);
                return state;
              }
            }
            journeys.value.push(journey);
            return state;
          }),
        setEmailMessageProps: (title) =>
          set((state) => {
            state.emailMessageTitle = title;
          }),
        replaceEmailMessageProps: (p) =>
          set((state) => {
            state.emailMessageUserProperties = p;
          }),
        setEmailMessagePropsJSON: (jsonString) =>
          set((state) => {
            state.emailMessageUserPropertiesJSON = jsonString;
          }),
        setEmailMessageSubject: (subject) =>
          set((state) => {
            state.emailMessageSubject = subject;
          }),
        setEmailMessageBody: (body) =>
          set((state) => {
            state.emailMessageBody = body;
          }),
        setEmailMessageFrom: (from) =>
          set((state) => {
            state.emailMessageFrom = from;
          }),
        setEmailMessageUpdateRequest: (request) =>
          set((state) => {
            state.emailMessageUpdateRequest = request;
          }),
        addEditableSegmentChild: (parentId) =>
          set((state) => {
            if (!state.editedSegment) {
              return;
            }

            const parent =
              parentId === state.editedSegment.definition.entryNode.id
                ? state.editedSegment.definition.entryNode
                : state.editedSegment.definition.nodes.find(
                    (n) => n.id === parentId
                  );

            if (
              !parent ||
              !(
                parent.type === SegmentNodeType.And ||
                parent.type === SegmentNodeType.Or
              )
            ) {
              return state;
            }

            const child: SegmentNode = {
              type: SegmentNodeType.Trait,
              id: uuid(),
              path: "",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "",
              },
            };
            parent.children.push(child.id);
            state.editedSegment.definition.nodes.push(child);
            return state;
          }),
        setEditableSegmentName: (name) => {
          set((state) => {
            if (!state.editedSegment) {
              return;
            }
            state.editedSegment.name = name;
          });
        },
        removeEditableSegmentChild: (parentId, childId) =>
          set((state) => {
            if (!state.editedSegment) {
              return;
            }
            const { editedSegment } = state;
            const parent =
              parentId === editedSegment.definition.entryNode.id
                ? editedSegment.definition.entryNode
                : editedSegment.definition.nodes.find((n) => n.id === parentId);

            if (
              !parent ||
              !(
                parent.type === SegmentNodeType.And ||
                parent.type === SegmentNodeType.Or
              )
            ) {
              return state;
            }

            parent.children = parent.children.filter((c) => c !== childId);
            editedSegment.definition.nodes.filter((n) => n.id !== childId);
            return state;
          }),
        updateEditableSegmentNodeData: (nodeId, updater) =>
          set((state) => {
            if (!state.editedSegment) {
              return;
            }
            const { editedSegment } = state;
            const node =
              nodeId === editedSegment.definition.entryNode.id
                ? editedSegment.definition.entryNode
                : editedSegment.definition.nodes.find((n) => n.id === nodeId);

            if (!node) {
              return state;
            }
            updater(node);
            return state;
          }),
        updateEditableSegmentNodeType: (nodeId, nodeType) =>
          set((state) => {
            if (!state.editedSegment) {
              return;
            }
            const { editedSegment } = state;
            if (nodeId === editedSegment.definition.entryNode.id) {
              const node = state.editedSegment.definition.entryNode;
              // No need to update node, already desired type
              if (node.type === nodeType) {
                return state;
              }
              const newType = mapNodeToNewType(node, nodeType);
              editedSegment.definition.entryNode = newType.primary;
              editedSegment.definition.nodes = newType.secondary.concat(
                editedSegment.definition.nodes
              );
            } else {
              editedSegment.definition.nodes.forEach((node) => {
                if (node.id !== nodeId) {
                  return;
                }

                // No need to update node, already desired type
                if (node.type === nodeType) {
                  return;
                }

                const newType = mapNodeToNewType(node, nodeType);

                editedSegment.definition.nodes = newType.secondary.concat(
                  editedSegment.definition.nodes
                );
                editedSegment.definition.nodes =
                  editedSegment.definition.nodes.map((n) =>
                    n.id === nodeId ? newType.primary : n
                  );
              });
            }
            return state;
          }),
        setSegmentUpdateRequest: (request) =>
          set((state) => {
            state.segmentUpdateRequest = request;
          }),
        ...createJourneySlice(set, ...remaining),
        ...preloadedState,
      };
      return appContents;
    })
  );

type AppStore = ReturnType<typeof initializeStore>;
let store: AppStore | null = null;

type UseStoreState = typeof initializeStore extends (
  ...args: never
) => UseBoundStore<infer T>
  ? T
  : never;

// TODO adapt code to allow serializable state to have different type than app
// state, to support non-serializable types like Map, Set etc.
export const useCreateStore = (
  serverInitialState?: Partial<AppState>
): (() => AppStore) => {
  // For SSR & SSG, always use a new store.
  if (typeof window === "undefined") {
    return () =>
      initializeStore({
        ...serverInitialState,
      });
  }

  const isReusingStore = Boolean(store);
  // For CSR, always re-use same store.
  const initializedStore: AppStore =
    store ?? initializeStore(serverInitialState);

  store = initializedStore;

  // And if initialState changes, then merge states in the next render cycle.
  //
  // eslint complaining "React Hooks must be called in the exact same order in every component render"
  // is ignorable as this code runs in same order in a given environment
  // TODO: Remove this warning with the following technique
  // https://medium.com/@alexandereardon/uselayouteffect-and-ssr-192986cdcf7a
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    // serverInitialState is undefined for CSR pages. It is up to you if you want to reset
    // states on CSR page navigation or not. I have chosen not to, but if you choose to,
    // then add `serverInitialState = getDefaultInitialState()` here.
    if (serverInitialState && isReusingStore) {
      initializedStore.setState(
        {
          // re-use functions from existing store
          ...initializedStore.getState(),
          // but reset all other properties.
          ...serverInitialState,
        },
        true // replace states, rather than shallow merging
      );
    }
  });

  return () => initializedStore;
};

export type PropsWithInitialState<T = object> = {
  serverInitialState: PreloadedState;
} & T;

export function addInitialStateToProps<T>(
  props: T,
  serverInitialState: Partial<AppState>
): T & PropsWithInitialState {
  const stateWithEnvVars: Partial<AppState> = {
    apiBase: process.env.DASHBOARD_API_BASE ?? "http://localhost:3001",
    ...serverInitialState,
  };
  return {
    ...props,
    // the "stringify and then parse again" piece is required as next.js
    // isn't able to serialize it to JSON properly
    serverInitialState: JSON.parse(JSON.stringify(stateWithEnvVars)),
  };
}
