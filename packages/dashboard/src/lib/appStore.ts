import {
  CompletionStatus,
  InternalEventType,
  RelationalOperators,
  SecretResource,
  SegmentDefinition,
  SegmentNode,
  SegmentNodeType,
  SegmentOperatorType,
  SubscriptionGroupType,
} from "isomorphic-lib/src/types";
import { useLayoutEffect } from "react";
import { v4 as uuid } from "uuid";
import { create, UseBoundStore } from "zustand";
import createContext from "zustand/context";
import { immer } from "zustand/middleware/immer";

import { createJourneySlice } from "../components/journeys/store";
import { AppContents, AppState, PreloadedState } from "./types";

// TODO migrate away from deprecreated createContext method
const zustandContext = createContext<UseStoreState>();
export const { Provider } = zustandContext;
export const useAppStore = zustandContext.useStore;

function removeOrphanedSegmentNodes(segmentDefinition: SegmentDefinition) {
  const nonOrphanNodes = new Set<string>();
  const nodesById = new Map<string, SegmentNode>();
  for (const node of segmentDefinition.nodes) {
    nodesById.set(node.id, node);
  }

  const currentNodes: SegmentNode[] = [segmentDefinition.entryNode];

  while (currentNodes.length) {
    const currentNode = currentNodes.pop();
    if (currentNode) {
      nonOrphanNodes.add(currentNode.id);

      if (
        currentNode.type === SegmentNodeType.And ||
        currentNode.type === SegmentNodeType.Or
      ) {
        for (const childId of currentNode.children) {
          const child = nodesById.get(childId);
          if (child) {
            currentNodes.push(child);
          }
        }
      }
    }
  }

  segmentDefinition.nodes = segmentDefinition.nodes.filter((n) =>
    nonOrphanNodes.has(n.id)
  );
}

function mapSegmentNodeToNewType(
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
    case SegmentNodeType.Broadcast: {
      return {
        primary: {
          type: SegmentNodeType.Broadcast,
          id: node.id,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.SubscriptionGroup: {
      return {
        primary: {
          type: SegmentNodeType.SubscriptionGroup,
          id: node.id,
          subscriptionGroupId: "",
          subscriptionGroupType: SubscriptionGroupType.OptIn,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Performed: {
      return {
        primary: {
          type: SegmentNodeType.Performed,
          id: node.id,
          event: "",
          times: 1,
          timesOperator: RelationalOperators.GreaterThanOrEqual,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Email: {
      return {
        primary: {
          type: SegmentNodeType.Email,
          id: node.id,
          templateId: "",
          event: InternalEventType.MessageSent,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.LastPerformed: {
      throw new Error(`Unimplemented segment node type ${type}.`);
    }
  }
}

export const initializeStore = (preloadedState: PreloadedState = {}) =>
  create(
    immer<AppContents>((set, ...remaining) => {
      const appContents: AppContents = {
        apiBase: "",
        trackDashboard: false,
        workspace: {
          type: CompletionStatus.NotStarted,
        },
        member: null,
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
        userProperties: {
          type: CompletionStatus.NotStarted,
        },
        writeKeys: [],
        secrets: [],
        enableSourceControl: preloadedState.enableSourceControl ?? false,
        enableMobilePush: preloadedState.enableMobilePush ?? false,

        // email message state
        emailMessageBody: "",
        emailMessageTitle: "",
        emailMessageSubject: "",
        emailMessageFrom: "",
        emailMessageUserProperties: {},
        emailMessageUserPropertiesJSON: "",
        mobilePushMessageTitle: "",
        mobilePushMessageBody: "",
        emailMessageReplyTo: "",
        mobilePushMesssageImageUrl: "",
        mobilePushMessageUserProperties: {},
        mobilePushMessageUserPropertiesJSON: "",
        emailMessageUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },
        mobilePushMessageUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },

        messageTemplateDeleteRequest: {
          type: CompletionStatus.NotStarted,
        },

        deleteMessage: (id) =>
          set((state) => {
            if (state.messages.type !== CompletionStatus.Successful) {
              return state;
            }
            state.messages.value = state.messages.value.filter(
              (m) => m.id !== id
            );
            return state;
          }),

        setMessageTemplateDeleteRequest: (request) =>
          set((state) => {
            state.messageTemplateDeleteRequest = request;
          }),

        // segment update view,
        editedSegment: null,
        segmentUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },

        // segment index view
        segmentDeleteRequest: {
          type: CompletionStatus.NotStarted,
        },

        segmentDownloadRequest: {
          type: CompletionStatus.NotStarted,
        },

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

        deleteSegment: (segmentId) =>
          set((state) => {
            if (state.segments.type !== CompletionStatus.Successful) {
              return state;
            }
            state.segments.value = state.segments.value.filter(
              (s) => s.id !== segmentId
            );
            return state;
          }),

        setSegmentDeleteRequest: (request) =>
          set((state) => {
            state.segmentDeleteRequest = request;
          }),

        setSegmentDownloadRequest: (request) =>
          set((state) => {
            state.segmentDownloadRequest = request;
          }),

        // journey index view
        journeyDeleteRequest: {
          type: CompletionStatus.NotStarted,
        },

        setJourneyDeleteRequest: (request) =>
          set((state) => {
            state.journeyDeleteRequest = request;
          }),

        deleteJourney: (journeyId) =>
          set((state) => {
            if (state.journeys.type !== CompletionStatus.Successful) {
              return state;
            }
            state.journeys.value = state.journeys.value.filter(
              (s) => s.id !== journeyId
            );
            return state;
          }),

        // userProperty index view
        userPropertyDeleteRequest: {
          type: CompletionStatus.NotStarted,
        },

        upsertUserProperty: (userProperty) =>
          set((state) => {
            let { userProperties } = state;
            if (userProperties.type !== CompletionStatus.Successful) {
              userProperties = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.userProperties = userProperties;
            }
            for (const existing of userProperties.value) {
              if (userProperty.id === existing.id) {
                Object.assign(existing, userProperty);
                return state;
              }
            }
            userProperties.value.push(userProperty);
            return state;
          }),

        deleteUserProperty: (userPropertyId) =>
          set((state) => {
            if (state.userProperties.type !== CompletionStatus.Successful) {
              return state;
            }
            state.userProperties.value = state.userProperties.value.filter(
              (s) => s.id !== userPropertyId
            );
            return state;
          }),

        setUserPropertyDeleteRequest: (request) =>
          set((state) => {
            state.userPropertyDeleteRequest = request;
          }),

        // broadcast update view
        broadcasts: {
          type: CompletionStatus.NotStarted,
        },
        broadcastUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },
        editedBroadcast: null,
        updateEditedBroadcast: (updatedBroadcast) =>
          set((state) => {
            if (!state.editedBroadcast) {
              return state;
            }

            state.editedBroadcast = {
              ...state.editedBroadcast,
              ...updatedBroadcast,
            };
            return state;
          }),
        setBroadcastUpdateRequest: (request) =>
          set((state) => {
            state.broadcastUpdateRequest = request;
          }),
        upsertBroadcast: (broadcast) =>
          set((state) => {
            let { broadcasts } = state;
            if (broadcasts.type !== CompletionStatus.Successful) {
              broadcasts = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.broadcasts = broadcasts;
            }
            for (const existing of broadcasts.value) {
              if (broadcast.id === existing.id) {
                Object.assign(existing, broadcast);
                return state;
              }
            }
            broadcasts.value.push(broadcast);
            return state;
          }),

        subscriptionGroups: {
          type: CompletionStatus.NotStarted,
        },
        subscriptionGroupUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },
        subscriptionGroupDeleteRequest: {
          type: CompletionStatus.NotStarted,
        },
        editedSubscriptionGroup: null,
        updateEditedSubscriptionGroup: (updatedSubscriptionGroup) =>
          set((state) => {
            if (!state.editedSubscriptionGroup) {
              return state;
            }

            state.editedSubscriptionGroup = {
              ...state.editedSubscriptionGroup,
              ...updatedSubscriptionGroup,
            };
            return state;
          }),
        setSubscriptionGroupUpdateRequest: (request) =>
          set((state) => {
            state.subscriptionGroupUpdateRequest = request;
          }),
        setSubscriptionGroupDeleteRequest: (request) =>
          set((state) => {
            state.subscriptionGroupDeleteRequest = request;
          }),
        upsertSubscriptionGroup: (subscriptionGroup) =>
          set((state) => {
            let { subscriptionGroups } = state;
            if (subscriptionGroups.type !== CompletionStatus.Successful) {
              subscriptionGroups = {
                type: CompletionStatus.Successful,
                value: [],
              };
              state.subscriptionGroups = subscriptionGroups;
            }
            for (const existing of subscriptionGroups.value) {
              if (subscriptionGroup.id === existing.id) {
                Object.assign(existing, subscriptionGroup);
                return state;
              }
            }
            subscriptionGroups.value.push(subscriptionGroup);
            return state;
          }),
        deleteSubscriptionGroup: (id) =>
          set((state) => {
            if (state.subscriptionGroups.type !== CompletionStatus.Successful) {
              return state;
            }
            state.subscriptionGroups.value =
              state.subscriptionGroups.value.filter((m) => m.id !== id);
            return state;
          }),
        upsertSecrets(secrets) {
          set((state) => {
            const secretsToCreate = secrets.reduce<Map<string, SecretResource>>(
              (map, secret) => {
                map.set(secret.name, secret);
                return map;
              },
              new Map()
            );
            for (const secret of state.secrets) {
              const newVal = secretsToCreate.get(secret.name);
              if (newVal) {
                secret.value = newVal.value;
                secretsToCreate.delete(secret.name);
              }
            }

            state.secrets = state.secrets.concat(
              Array.from(secretsToCreate.values())
            );
          });
        },
        deleteSecret(secretName) {
          set((state) => {
            state.secrets = state.secrets.filter((s) => s.name !== secretName);
          });
        },

        // user property update view
        editedUserProperty: null,

        userPropertyUpdateRequest: {
          type: CompletionStatus.NotStarted,
        },

        updateUserPropertyDefinition: (definition) =>
          set((state) => {
            if (!state.editedUserProperty) {
              return state;
            }
            state.editedUserProperty.definition = definition;
            return state;
          }),

        setUserPropertyUpdateRequest: (request) =>
          set((state) => {
            state.userPropertyUpdateRequest = request;
          }),

        setEditableUserPropertyName: (name) =>
          set((state) => {
            if (!state.editedUserProperty) {
              return state;
            }
            state.editedUserProperty.name = name;
            return state;
          }),

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
        setEmailMessageTitle: (title) =>
          set((state) => {
            state.emailMessageTitle = title;
          }),
        setEmailMessageReplyTo: (replyTo) =>
          set((state) => {
            state.emailMessageReplyTo = replyTo;
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
        setMobilePushMessageImageUrl: (imageUrl) =>
          set((state) => {
            state.mobilePushMesssageImageUrl = imageUrl;
          }),
        setMobilePushMessageTitle: (title) =>
          set((state) => {
            state.mobilePushMessageTitle = title;
          }),
        setMobilePushMessageBody: (body) =>
          set((state) => {
            state.mobilePushMessageBody = body;
          }),
        setMobilePushMessagePropsJSON: (jsonString) =>
          set((state) => {
            state.mobilePushMessageUserPropertiesJSON = jsonString;
          }),
        setMobilePushMessageUpdateRequest: (request) =>
          set((state) => {
            state.mobilePushMessageUpdateRequest = request;
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
            removeOrphanedSegmentNodes(state.editedSegment.definition);
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
              const newType = mapSegmentNodeToNewType(node, nodeType);
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

                const newType = mapSegmentNodeToNewType(node, nodeType);

                editedSegment.definition.nodes = newType.secondary.concat(
                  editedSegment.definition.nodes
                );
                editedSegment.definition.nodes =
                  editedSegment.definition.nodes.map((n) =>
                    n.id === nodeId ? newType.primary : n
                  );
              });
            }

            removeOrphanedSegmentNodes(state.editedSegment.definition);
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
