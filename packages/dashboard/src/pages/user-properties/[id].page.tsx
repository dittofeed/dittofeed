import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  AddCircleOutlineOutlined,
  ContentCopyOutlined,
  Delete,
} from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import { db } from "backend-lib/src/db";
import * as schema from "backend-lib/src/db/schema";
import { and, eq } from "drizzle-orm";
import { Draft } from "immer";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  AnyOfUserPropertyDefinition,
  CompletionStatus,
  DuplicateResourceTypeEnum,
  FileUserPropertyDefinition,
  GroupChildrenUserPropertyDefinitions,
  GroupUserPropertyDefinition,
  KeyedPerformedUserPropertyDefinition,
  PerformedUserPropertyDefinition,
  TraitUserPropertyDefinition,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useCallback, useMemo, useState } from "react";
import { v4 as uuidv4, validate } from "uuid";

import DashboardContent from "../../components/dashboardContent";
import { EditableTitle } from "../../components/editableName/v2";
import { SubtleHeader } from "../../components/headers";
import InfoTooltip from "../../components/infoTooltip";
import { SettingsCommand, SettingsMenu } from "../../components/settingsMenu";
import TraitAutocomplete from "../../components/traitAutocomplete";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore, useAppStorePick } from "../../lib/appStore";
import { copyToClipboard } from "../../lib/copyToClipboard";
import { requestContext } from "../../lib/requestContext";
import {
  GroupedOption,
  PreloadedState,
  PropsWithInitialState,
} from "../../lib/types";
import { useDuplicateResourceMutation } from "../../lib/useDuplicateResourceMutation";

const selectorWidth = "192px";

const idOption = {
  id: UserPropertyDefinitionType.Id,
  group: "Identifiers",
  label: "User Id",
  disabled: true,
};

const anonymousIdOption = {
  id: UserPropertyDefinitionType.Id,
  group: "Identifiers",
  label: "User Anonymous Id",
  disabled: true,
};

const traitOption = {
  id: UserPropertyDefinitionType.Trait,
  group: "Identify Events",
  label: "Trait",
};

const performedOption = {
  id: UserPropertyDefinitionType.Performed,
  group: "Track Events",
  label: "Performed",
};

const fileOption = {
  id: UserPropertyDefinitionType.File,
  group: "Track Events",
  label: "File",
};

const anyOfOption = {
  id: UserPropertyDefinitionType.AnyOf,
  group: "Group",
  label: "Any Of",
};

const keyedPerformedOption = {
  id: UserPropertyDefinitionType.KeyedPerformed,
  group: "Track Events",
  label: "Keyed Performed",
};

type UserPropertyGroupedOption = GroupedOption<UserPropertyDefinitionType>;

const userPropertyOptions: UserPropertyGroupedOption[] = [
  traitOption,
  performedOption,
  fileOption,
  keyedPerformedOption,
  anyOfOption,
  idOption,
  anonymousIdOption,
];

const groupedUserPropertyOptions: UserPropertyGroupedOption[] = [
  traitOption,
  performedOption,
  fileOption,
];

function getUserPropertyOption(
  type: UserPropertyDefinitionType,
): UserPropertyGroupedOption {
  switch (type) {
    case UserPropertyDefinitionType.Id:
      return {
        ...idOption,
      };
    case UserPropertyDefinitionType.AnonymousId:
      return {
        ...anonymousIdOption,
      };
    case UserPropertyDefinitionType.Trait:
      return traitOption;
    case UserPropertyDefinitionType.Performed:
      return performedOption;
    case UserPropertyDefinitionType.AnyOf:
      return anyOfOption;
    case UserPropertyDefinitionType.Group:
      return anyOfOption;
    case UserPropertyDefinitionType.File:
      return fileOption;
    case UserPropertyDefinitionType.PerformedMany:
      throw new Error("Not implemented");
    case UserPropertyDefinitionType.KeyedPerformed:
      return keyedPerformedOption;
    default:
      assertUnreachable(type);
  }
}

function defaultUserProperty(
  type: UserPropertyDefinitionType,
  id?: string,
): UserPropertyDefinition {
  switch (type) {
    case UserPropertyDefinitionType.Id:
      return {
        type: UserPropertyDefinitionType.Id,
      };
    case UserPropertyDefinitionType.AnonymousId:
      return {
        type: UserPropertyDefinitionType.AnonymousId,
      };
    case UserPropertyDefinitionType.Trait:
      return {
        id,
        type: UserPropertyDefinitionType.Trait,
        path: "",
      };
    case UserPropertyDefinitionType.Performed:
      return {
        id,
        type: UserPropertyDefinitionType.Performed,
        event: "",
        path: "",
      };
    case UserPropertyDefinitionType.AnyOf: {
      const childId = id ?? uuidv4();
      return {
        type: UserPropertyDefinitionType.Group,
        nodes: [
          {
            id: "any-of-1",
            type: UserPropertyDefinitionType.AnyOf,
            children: [childId],
          },
          {
            id: childId,
            type: UserPropertyDefinitionType.Trait,
            path: "",
          },
        ],
        entry: "any-of-1",
      };
    }
    case UserPropertyDefinitionType.File:
      return {
        id,
        type: UserPropertyDefinitionType.File,
        name: "my_file_name.pdf",
      };
    case UserPropertyDefinitionType.Group: {
      throw new Error("Not implemented");
    }
    case UserPropertyDefinitionType.PerformedMany:
      throw new Error("Not implemented");
    case UserPropertyDefinitionType.KeyedPerformed:
      return {
        id,
        type: UserPropertyDefinitionType.KeyedPerformed,
        event: "",
        key: "",
        path: "",
        properties: [],
      };
    default:
      assertUnreachable(type);
  }
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const serverInitialState: PreloadedState = {};

    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const workspaceId = dfContext.workspace.id;
    const userProperty = await db().query.userProperty.findFirst({
      where: and(
        eq(schema.userProperty.id, id),
        eq(schema.userProperty.workspaceId, workspaceId),
      ),
    });

    let userPropertyResource: UserPropertyResource;
    if (userProperty && userProperty.workspaceId === workspaceId) {
      const definition = unwrap(
        schemaValidate(userProperty.definition, UserPropertyDefinition),
      );
      userPropertyResource = {
        id: userProperty.id,
        name: userProperty.name,
        workspaceId,
        definition,
        exampleValue: userProperty.exampleValue ?? undefined,
        updatedAt: Number(userProperty.updatedAt),
      };
      serverInitialState.userProperties = {
        type: CompletionStatus.Successful,
        value: [userPropertyResource],
      };
    } else {
      userPropertyResource = {
        name: "exampleName",
        id,
        workspaceId,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "examplePath",
        },
        exampleValue: '"exampleValue"',
        updatedAt: Number(new Date()),
      };
    }

    serverInitialState.editedUserProperty = userPropertyResource;

    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

function FileUserPropertyDefinitionEditor(
  definition: FileUserPropertyDefinition,
) {
  const { updateUserPropertyDefinition } = useAppStorePick([
    "updateUserPropertyDefinition",
  ]);

  const { id, name: fileName } = definition;
  const handleChange = (name: string) => {
    updateUserPropertyDefinition((current) => {
      let d: FileUserPropertyDefinition | null = null;
      if (current.type === UserPropertyDefinitionType.File) {
        d = current;
      } else if (current.type === UserPropertyDefinitionType.Group && id) {
        for (const node of current.nodes) {
          if (node.id === id && node.type === UserPropertyDefinitionType.File) {
            d = node;
            break;
          }
        }
      }

      if (!d) {
        return current;
      }
      d.name = name;
      return current;
    });
  };
  return (
    <TextField
      label="File Name"
      value={fileName}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        handleChange(e.target.value)
      }
    />
  );
}

function TraitUserPropertyDefinitionEditor({
  definition,
}: {
  definition: TraitUserPropertyDefinition;
}) {
  const updateUserPropertyDefinition = useAppStore(
    (state) => state.updateUserPropertyDefinition,
  );
  const handleTraitChange = (trait: string) => {
    updateUserPropertyDefinition((current) => {
      let traitDefinition: TraitUserPropertyDefinition;
      if (current.type === UserPropertyDefinitionType.Trait) {
        traitDefinition = current;
      } else if (
        current.type === UserPropertyDefinitionType.Group &&
        definition.id
      ) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        traitDefinition = current.nodes.find(
          (n) => n.id === definition.id,
        ) as TraitUserPropertyDefinition;
      } else {
        return current;
      }
      traitDefinition.path = trait;
      return current;
    });
  };

  return (
    <TraitAutocomplete
      traitPath={definition.path}
      traitOnChange={handleTraitChange}
      sx={{ width: selectorWidth }}
    />
  );
}

function KeyedPerformedUserPropertyDefinitionEditor({
  definition,
}: {
  definition: KeyedPerformedUserPropertyDefinition;
}) {
  const { updateUserPropertyDefinition, properties } = useAppStorePick([
    "updateUserPropertyDefinition",
    "properties",
  ]);

  const handlePathChange = (newPath: string | null) => {
    if (newPath === null) {
      return;
    }
    updateUserPropertyDefinition((current) => {
      let d: KeyedPerformedUserPropertyDefinition;
      if (current.type === UserPropertyDefinitionType.KeyedPerformed) {
        d = current;
      } else {
        return current;
      }
      d.path = newPath;
      return current;
    });
  };

  const handleKeyChange = (newKey: string | null) => {
    if (newKey === null) {
      return;
    }
    updateUserPropertyDefinition((current) => {
      let d: KeyedPerformedUserPropertyDefinition;
      if (current.type === UserPropertyDefinitionType.KeyedPerformed) {
        d = current;
      } else {
        return current;
      }
      d.key = newKey;
      return current;
    });
  };

  const updatePerformedNode = useCallback(
    (
      updater: (
        currentValue: Draft<KeyedPerformedUserPropertyDefinition>,
      ) => Draft<KeyedPerformedUserPropertyDefinition>,
    ) => {
      updateUserPropertyDefinition((current) => {
        let d: KeyedPerformedUserPropertyDefinition | null = null;
        if (current.type === UserPropertyDefinitionType.KeyedPerformed) {
          d = current;
        }
        if (d) {
          updater(d);
        }
        return current;
      });
    },
    [updateUserPropertyDefinition],
  );

  const handleEventNameChange = (newEventName: string | null) => {
    if (newEventName === null) {
      return;
    }
    updatePerformedNode((current) => {
      current.event = newEventName;
      return current;
    });
  };

  const handleAddProperty = () => {
    updatePerformedNode((current) => {
      const nodeProperties = current.properties ?? [];
      // limit to 100 properties
      if (nodeProperties.length >= 100) {
        return current;
      }
      nodeProperties.push({
        path: "myPropertyPath",
        operator: {
          type: UserPropertyOperatorType.Equals,
          value: "myValue",
        },
      });
      current.properties = nodeProperties;
      return current;
    });
  };

  let propertyRows: React.ReactNode = null;
  if (definition.properties) {
    propertyRows = definition.properties.map((property, i) => {
      const handlePropertyPathChange = (newPath: string | null) => {
        if (newPath === null) {
          return;
        }
        updatePerformedNode((current) => {
          const existingProperty = current.properties?.[i];

          if (!existingProperty) {
            return current;
          }
          existingProperty.path = newPath;
          return current;
        });
      };

      const handlePropertyValueChange = (
        e: React.ChangeEvent<HTMLInputElement>,
      ) => {
        updatePerformedNode((current) => {
          const newValue = e.target.value;
          const existingProperty = current.properties?.[i];

          if (!existingProperty) {
            return current;
          }
          existingProperty.operator.value = newValue;
          return current;
        });
      };
      const handleDelete = () => {
        updatePerformedNode((current) => {
          const nodeProperties = current.properties ?? [];
          nodeProperties.splice(i, 1);
          current.properties = nodeProperties;
          return current;
        });
      };
      return (
        <Stack
          direction="row"
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          spacing={1}
          sx={{
            alignItems: "center",
          }}
        >
          <Autocomplete
            value={property.path}
            freeSolo
            sx={{ width: selectorWidth }}
            options={properties[definition.event] ?? []}
            onInputChange={(_event, newPath) => {
              handlePropertyPathChange(newPath);
            }}
            renderInput={(params) => (
              <TextField label="Property Path" {...params} variant="outlined" />
            )}
          />
          {/* hardcoded until support for multiple operators is added */}
          <Select value={UserPropertyOperatorType.Equals}>
            <MenuItem value={UserPropertyOperatorType.Equals}>Equals</MenuItem>
          </Select>
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
          <IconButton color="error" size="large" onClick={handleDelete}>
            <Delete />
          </IconButton>
        </Stack>
      );
    });
  }

  return (
    <Stack direction="column" spacing={2}>
      <Stack spacing={1} direction="row">
        <Autocomplete
          value={definition.event}
          freeSolo
          sx={{ width: selectorWidth }}
          options={Object.keys(properties)}
          onInputChange={(e, newPath) => {
            handleEventNameChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Event Name" {...params} variant="outlined" />
          )}
        />
        <Autocomplete
          value={definition.key}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[definition.event] ?? []}
          onInputChange={(_e, newKey) => {
            handleKeyChange(newKey);
          }}
          renderInput={(params) => (
            <TextField
              label="Property Key Path"
              {...params}
              variant="outlined"
            />
          )}
        />
        <Autocomplete
          value={definition.path}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[definition.event] ?? []}
          onInputChange={(_e, newPath) => {
            handlePathChange(newPath);
          }}
          renderInput={(params) => (
            <TextField
              label="AssignedProperty Path"
              {...params}
              variant="outlined"
            />
          )}
        />
        <Button variant="contained" onClick={() => handleAddProperty()}>
          Property
        </Button>
      </Stack>
      {propertyRows && definition.properties?.length ? (
        <SubtleHeader>Properties</SubtleHeader>
      ) : null}
      {propertyRows}
    </Stack>
  );
}

function PerformedUserPropertyDefinitionEditor({
  definition,
}: {
  definition: PerformedUserPropertyDefinition;
}) {
  const { updateUserPropertyDefinition, properties } = useAppStorePick([
    "updateUserPropertyDefinition",
    "properties",
  ]);

  const handlePathChange = (newPath: string | null) => {
    if (newPath === null) {
      return;
    }
    updateUserPropertyDefinition((current) => {
      let d: PerformedUserPropertyDefinition;
      if (current.type === UserPropertyDefinitionType.Performed) {
        d = current;
      } else if (
        current.type === UserPropertyDefinitionType.Group &&
        definition.id
      ) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        d = current.nodes.find(
          (n) => n.id === definition.id,
        ) as PerformedUserPropertyDefinition;
      } else {
        return current;
      }
      d.path = newPath;
      return current;
    });
  };

  const updatePerformedNode = useCallback(
    (
      updater: (
        currentValue: Draft<PerformedUserPropertyDefinition>,
      ) => Draft<PerformedUserPropertyDefinition>,
    ) => {
      updateUserPropertyDefinition((current) => {
        let d: PerformedUserPropertyDefinition | null = null;
        if (current.type === UserPropertyDefinitionType.Performed) {
          d = current;
        } else if (
          current.type === UserPropertyDefinitionType.Group &&
          definition.id
        ) {
          for (const node of current.nodes) {
            if (
              node.id === definition.id &&
              node.type === UserPropertyDefinitionType.Performed
            ) {
              d = node;
              break;
            }
          }
        }
        if (d) {
          updater(d);
        }
        return current;
      });
    },
    [updateUserPropertyDefinition, definition.id],
  );

  const handleEventNameChange = (newEventName: string | null) => {
    if (newEventName === null) {
      return;
    }
    updatePerformedNode((current) => {
      current.event = newEventName;
      return current;
    });
  };

  const handleAddProperty = () => {
    updatePerformedNode((current) => {
      const nodeProperties = current.properties ?? [];
      // limit to 100 properties
      if (nodeProperties.length >= 100) {
        return current;
      }
      nodeProperties.push({
        path: "myPropertyPath",
        operator: {
          type: UserPropertyOperatorType.Equals,
          value: "myValue",
        },
      });
      current.properties = nodeProperties;
      return current;
    });
  };

  let propertyRows: React.ReactNode = null;
  if (definition.properties) {
    propertyRows = definition.properties.map((property, i) => {
      const handlePropertyPathChange = (newPath: string | null) => {
        if (newPath === null) {
          return;
        }
        updatePerformedNode((current) => {
          const existingProperty = current.properties?.[i];

          if (!existingProperty) {
            return current;
          }
          existingProperty.path = newPath;
          return current;
        });
      };

      const handlePropertyValueChange = (
        e: React.ChangeEvent<HTMLInputElement>,
      ) => {
        updatePerformedNode((current) => {
          const newValue = e.target.value;
          const existingProperty = current.properties?.[i];

          if (!existingProperty) {
            return current;
          }
          existingProperty.operator.value = newValue;
          return current;
        });
      };
      const handleDelete = () => {
        updatePerformedNode((current) => {
          const nodeProperties = current.properties ?? [];
          nodeProperties.splice(i, 1);
          current.properties = nodeProperties;
          return current;
        });
      };
      return (
        <Stack
          direction="row"
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          spacing={1}
          sx={{
            alignItems: "center",
          }}
        >
          <Autocomplete
            value={property.path}
            freeSolo
            sx={{ width: selectorWidth }}
            options={properties[definition.event] ?? []}
            onInputChange={(_event, newPath) => {
              handlePropertyPathChange(newPath);
            }}
            renderInput={(params) => (
              <TextField label="Property Path" {...params} variant="outlined" />
            )}
          />
          {/* hardcoded until support for multiple operators is added */}
          <Select value={UserPropertyOperatorType.Equals}>
            <MenuItem value={UserPropertyOperatorType.Equals}>Equals</MenuItem>
          </Select>
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
          <IconButton color="error" size="large" onClick={handleDelete}>
            <Delete />
          </IconButton>
        </Stack>
      );
    });
  }

  return (
    <Stack direction="column" spacing={2}>
      <Stack spacing={1} direction="row">
        <Autocomplete
          value={definition.event}
          freeSolo
          sx={{ width: selectorWidth }}
          options={Object.keys(properties)}
          onInputChange={(e, newPath) => {
            handleEventNameChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Event Name" {...params} variant="outlined" />
          )}
        />
        <Autocomplete
          value={definition.path}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[definition.event] ?? []}
          onInputChange={(e, newPath) => {
            handlePathChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Property Path" {...params} variant="outlined" />
          )}
        />
        <Button variant="contained" onClick={() => handleAddProperty()}>
          Property
        </Button>
      </Stack>
      {propertyRows && definition.properties?.length ? (
        <SubtleHeader>Properties</SubtleHeader>
      ) : null}
      {propertyRows}
    </Stack>
  );
}

function AnyOfUserPropertyDefinitionEditor({
  groupedUserProperty,
  definition,
}: {
  groupedUserProperty: GroupUserPropertyDefinition;
  definition: AnyOfUserPropertyDefinition;
}) {
  const { updateUserPropertyDefinition } = useAppStorePick([
    "updateUserPropertyDefinition",
  ]);
  return (
    <>
      <IconButton
        color="primary"
        size="large"
        onClick={() =>
          updateUserPropertyDefinition((current) => {
            if (current.type !== UserPropertyDefinitionType.Group) {
              return current;
            }
            const entry = current.nodes.find((n) => n.id === current.entry);
            if (!entry || entry.type !== UserPropertyDefinitionType.AnyOf) {
              return current;
            }
            const newId = uuidv4();
            const newChild = defaultUserProperty(
              UserPropertyDefinitionType.Trait,
              newId,
            );
            if (newChild.type !== UserPropertyDefinitionType.Trait) {
              return current;
            }
            entry.children.push(newId);
            current.nodes.push(newChild);
            return current;
          })
        }
      >
        <AddCircleOutlineOutlined />
      </IconButton>
      <Stack spacing={3} direction="column">
        {groupedUserProperty.nodes
          .filter((n) => n.id && definition.children.includes(n.id))
          .map((n: GroupChildrenUserPropertyDefinitions, i) => {
            const condition = getUserPropertyOption(n.type);
            if (n.type === UserPropertyDefinitionType.AnyOf) {
              return null;
            }
            return (
              <Stack direction="row" spacing={1} key={n.id}>
                <Autocomplete
                  value={condition}
                  sx={{ width: selectorWidth }}
                  getOptionDisabled={(option) => option.disabled === true}
                  groupBy={(option) => option.group}
                  onChange={(
                    _event: unknown,
                    newValue: UserPropertyGroupedOption,
                  ) => {
                    updateUserPropertyDefinition((current) => {
                      if (current.type !== UserPropertyDefinitionType.Group) {
                        return current;
                      }
                      current.nodes = current.nodes.map((node) => {
                        if (node.id === n.id) {
                          const newNode = defaultUserProperty(
                            newValue.id,
                            node.id,
                          );

                          if (
                            !(
                              newNode.type ===
                                UserPropertyDefinitionType.Trait ||
                              newNode.type ===
                                UserPropertyDefinitionType.Performed
                            )
                          ) {
                            return node;
                          }
                          return newNode;
                        }
                        return node;
                      });

                      return current;
                    });
                  }}
                  disableClearable
                  options={groupedUserPropertyOptions}
                  renderInput={(params) => (
                    <TextField
                      label="User Property Type"
                      {...params}
                      variant="outlined"
                    />
                  )}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
                <DefinitionComponent definition={n} />
                {i > 0 ? (
                  <IconButton
                    color="error"
                    size="large"
                    onClick={() =>
                      updateUserPropertyDefinition((current) => {
                        if (current.type !== UserPropertyDefinitionType.Group) {
                          return current;
                        }
                        const entry = current.nodes.find(
                          (node) => node.id === current.entry,
                        );
                        if (
                          !entry ||
                          entry.type !== UserPropertyDefinitionType.AnyOf
                        ) {
                          return current;
                        }
                        entry.children = entry.children.filter(
                          (c) => c !== n.id,
                        );
                        current.nodes = current.nodes.filter(
                          (c) => c.id !== n.id,
                        );
                        return current;
                      })
                    }
                  >
                    <Delete />
                  </IconButton>
                ) : null}
              </Stack>
            );
          })}
      </Stack>
    </>
  );
}

function DefinitionComponent({
  definition,
}: {
  definition: UserPropertyDefinition;
}) {
  let up: React.ReactElement;
  switch (definition.type) {
    case UserPropertyDefinitionType.Id:
      up = <Typography>Hard coded user property for user id.</Typography>;
      break;
    case UserPropertyDefinitionType.AnonymousId:
      up = (
        <Typography>Hard coded user property for anonymous users.</Typography>
      );
      break;
    case UserPropertyDefinitionType.Trait:
      up = <TraitUserPropertyDefinitionEditor definition={definition} />;
      break;
    case UserPropertyDefinitionType.Performed:
      up = <PerformedUserPropertyDefinitionEditor definition={definition} />;
      break;
    case UserPropertyDefinitionType.Group: {
      const entryNode = definition.nodes.find((n) => n.id === definition.entry);
      if (!entryNode || entryNode.type !== UserPropertyDefinitionType.AnyOf) {
        throw new Error("Entry node not found");
      }
      up = (
        <AnyOfUserPropertyDefinitionEditor
          groupedUserProperty={definition}
          definition={entryNode}
        />
      );
      break;
    }
    case UserPropertyDefinitionType.File:
      up = <FileUserPropertyDefinitionEditor {...definition} />;
      break;
    case UserPropertyDefinitionType.KeyedPerformed:
      up = (
        <KeyedPerformedUserPropertyDefinitionEditor definition={definition} />
      );
      break;
    case UserPropertyDefinitionType.PerformedMany:
      throw new Error("Not implemented");
    default:
      assertUnreachable(definition);
  }
  return up;
}

function UserPropertyDefinitionEditor({
  definition,
  isProtected,
}: {
  isProtected: boolean;
  definition: UserPropertyDefinition;
}) {
  const theme = useTheme();
  const condition = getUserPropertyOption(definition.type);
  const {
    editedUserProperty,
    updateUserPropertyDefinition,
    updateEditedUserProperty,
  } = useAppStorePick([
    "editedUserProperty",
    "updateUserPropertyDefinition",
    "updateEditedUserProperty",
  ]);

  const selectUserPropertyType = (
    <Autocomplete
      value={condition}
      sx={{ width: selectorWidth }}
      disabled={isProtected}
      getOptionDisabled={(option) => option.disabled === true}
      groupBy={(option) => option.group}
      onChange={(_event: unknown, newValue: UserPropertyGroupedOption) => {
        updateUserPropertyDefinition(() => defaultUserProperty(newValue.id));
      }}
      disableClearable
      options={userPropertyOptions}
      renderInput={(params) => (
        <TextField label="User Property Type" {...params} variant="outlined" />
      )}
    />
  );

  return (
    <Stack spacing={1} direction="row">
      <Stack spacing={2} sx={{ flex: 1 }}>
        <SubtleHeader>Definition</SubtleHeader>
        <Stack spacing={1} direction="row">
          {selectUserPropertyType}
          <DefinitionComponent definition={definition} />
        </Stack>
      </Stack>
      <Stack spacing={2} sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1}>
          <SubtleHeader>Example Value (JSON)</SubtleHeader>
          <InfoTooltip title="This example value will be used as the default value in the template editor." />
        </Stack>
        <ReactCodeMirror
          value={editedUserProperty?.exampleValue ?? ""}
          onChange={(json) => {
            updateEditedUserProperty({
              exampleValue: json,
            });
          }}
          extensions={[
            codeMirrorJson(),
            linter(jsonParseLinter()),
            EditorView.lineWrapping,
            EditorView.theme({
              "&": {
                fontFamily: theme.typography.fontFamily,
              },
            }),
            lintGutter(),
          ]}
        />
      </Stack>
    </Stack>
  );
}

export default function NewUserProperty() {
  const path = useRouter();
  const id = typeof path.query.id === "string" ? path.query.id : null;
  const {
    editedUserProperty,
    updateEditedUserProperty,
    apiBase,
    userPropertyUpdateRequest,
    setUserPropertyUpdateRequest,
    upsertUserProperty,
  } = useAppStorePick([
    "editedUserProperty",
    "updateEditedUserProperty",
    "apiBase",
    "userPropertyUpdateRequest",
    "setUserPropertyUpdateRequest",
    "upsertUserProperty",
  ]);
  const theme = useTheme();

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const duplicateUserPropertyMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setSnackbarMessage(`User property duplicated as "${data.name}"!`);
      setSnackbarOpen(true);
    },
    onError: () => {
      setSnackbarMessage("Failed to duplicate user property.");
      setSnackbarOpen(true);
    },
  });

  const isProtected = editedUserProperty
    ? protectedUserProperties.has(editedUserProperty.name)
    : false;

  const handleDuplicate = useCallback(() => {
    if (!editedUserProperty || duplicateUserPropertyMutation.isPending) {
      return;
    }
    duplicateUserPropertyMutation.mutate({
      name: editedUserProperty.name,
      resourceType: DuplicateResourceTypeEnum.UserProperty,
    });
  }, [editedUserProperty, duplicateUserPropertyMutation]);

  const commands: SettingsCommand[] = useMemo(
    () => [
      {
        label: "Duplicate user property",
        icon: <ContentCopyOutlined />,
        disabled: !editedUserProperty || isProtected,
        action: handleDuplicate,
      },
      {
        label: "Copy user property definition as JSON",
        icon: <ContentCopyOutlined />,
        disabled: !editedUserProperty,
        action: () => {
          if (!editedUserProperty) {
            return;
          }
          copyToClipboard({
            value: JSON.stringify(editedUserProperty.definition),
            successNotice:
              "User property definition copied to clipboard as JSON.",
            failureNotice: "Failed to copy user property definition.",
          });
        },
      },
    ],
    [editedUserProperty, handleDuplicate, isProtected],
  );

  const handleSave = useMemo(
    () =>
      editedUserProperty
        ? apiRequestHandlerFactory({
            request: userPropertyUpdateRequest,
            setRequest: setUserPropertyUpdateRequest,
            responseSchema: UserPropertyResource,
            setResponse: upsertUserProperty,
            onSuccessNotice: `Saved user property ${editedUserProperty.name}`,
            onFailureNoticeHandler: () =>
              `API Error: Failed to save user property ${editedUserProperty.name}`,
            requestConfig: {
              method: "PUT",
              url: `${apiBase}/api/user-properties`,
              data: editedUserProperty,
              headers: {
                "Content-Type": "application/json",
              },
            },
          })
        : () => {},
    [
      apiBase,
      editedUserProperty,
      setUserPropertyUpdateRequest,
      upsertUserProperty,
      userPropertyUpdateRequest,
    ],
  );

  if (!editedUserProperty) {
    return null;
  }
  const { name } = editedUserProperty;
  let body: React.ReactNode = null;
  // deal with zustand / nextjs hydration being async
  if (id === editedUserProperty.id) {
    body = (
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignContent="center"
        >
          <EditableTitle
            text={name}
            onSubmit={(val) =>
              updateEditedUserProperty({
                name: val,
              })
            }
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={handleSave}>
              Save
            </Button>
            <SettingsMenu commands={commands} />
          </Stack>
        </Stack>
        <Box
          sx={{
            backgroundColor: "white",
            p: 3,
            borderRadius: 1,
            border: `1px solid ${theme.palette.grey[200]}`,
          }}
        >
          <UserPropertyDefinitionEditor
            isProtected={isProtected}
            definition={editedUserProperty.definition}
          />
        </Box>
      </Stack>
    );
  }

  return (
    <>
      <DashboardContent>{body}</DashboardContent>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}
