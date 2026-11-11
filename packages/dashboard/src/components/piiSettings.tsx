import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { guessPiiCategory } from "isomorphic-lib/src/pii";
import {
  CompletionStatus,
  PiiCategory,
  PiiCategoryEnum,
  PiiFieldScope,
  PiiFieldScopeEnum,
  RoleEnum,
} from "isomorphic-lib/src/types";
import { useMemo, useState } from "react";

import { useAppStorePick } from "../lib/appStore";
import {
  useCreatePiiFieldsMutation,
  useDeletePiiFieldMutation,
  useUpdatePiiFieldMutation,
} from "../lib/usePiiMutations";
import {
  usePiiAuditQuery,
  usePiiColumnCatalogQuery,
  usePiiFieldsQuery,
} from "../lib/usePiiQuery";

const scopeLabels: Record<PiiFieldScope, string> = {
  [PiiFieldScopeEnum.UserProperty]: "User properties",
  [PiiFieldScopeEnum.EventProperty]: "Event properties",
  [PiiFieldScopeEnum.Column]: "Platform columns",
};

interface Candidate {
  name: string;
  description?: string;
}

function useCandidates(scope: PiiFieldScope): Candidate[] {
  const { userProperties, traits, properties } = useAppStorePick([
    "userProperties",
    "traits",
    "properties",
  ]);
  const catalog = usePiiColumnCatalogQuery();

  return useMemo(() => {
    switch (scope) {
      case PiiFieldScopeEnum.UserProperty: {
        if (userProperties.type !== CompletionStatus.Successful) {
          return [];
        }
        return userProperties.value.map((property) => ({
          name: property.name,
        }));
      }
      case PiiFieldScopeEnum.EventProperty: {
        const names = new Set<string>(traits);
        Object.values(properties).forEach((propertyNames) => {
          propertyNames.forEach((name) => names.add(name));
        });
        return Array.from(names)
          .sort()
          .map((name) => ({ name }));
      }
      case PiiFieldScopeEnum.Column:
        return (catalog.data?.columns ?? []).map((column) => ({
          name: column.name,
          description: column.description,
        }));
      default:
        return [];
    }
  }, [scope, userProperties, traits, properties, catalog.data]);
}

function PiiAuditTable() {
  const { data, isLoading, error } = usePiiAuditQuery();

  if (isLoading) {
    return <CircularProgress size={20} />;
  }
  if (error) {
    return null;
  }
  const audits = data?.audits ?? [];
  if (audits.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No plaintext PII access recorded yet.
      </Typography>
    );
  }
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Time</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Field</TableCell>
            <TableCell>Records</TableCell>
            <TableCell>Member</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {audits.map((audit) => (
            <TableRow key={audit.id}>
              <TableCell>{new Date(audit.createdAt).toLocaleString()}</TableCell>
              <TableCell>{audit.action}</TableCell>
              <TableCell>
                <Chip size="small" label={audit.fieldName} />
              </TableCell>
              <TableCell>{audit.recordCount}</TableCell>
              <TableCell>{audit.workspaceMemberId ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function PiiScopeEditor({ scope }: { scope: PiiFieldScope }) {
  const [search, setSearch] = useState("");
  const fieldsQuery = usePiiFieldsQuery(scope);
  const createMutation = useCreatePiiFieldsMutation();
  const updateMutation = useUpdatePiiFieldMutation();
  const deleteMutation = useDeletePiiFieldMutation();
  const candidates = useCandidates(scope);

  const markedByName = useMemo(() => {
    const map = new Map<string, { id: string; category: string }>();
    (fieldsQuery.data?.fields ?? []).forEach((field) => {
      map.set(field.name, { id: field.id, category: field.category });
    });
    return map;
  }, [fieldsQuery.data]);

  const rows = useMemo(() => {
    const candidateNames = new Set(candidates.map((c) => c.name));
    const extraMarked = Array.from(markedByName.keys())
      .filter((name) => !candidateNames.has(name))
      .map((name): Candidate => ({ name }));
    const all = [...candidates, ...extraMarked];
    const term = search.trim().toLowerCase();
    if (!term) {
      return all;
    }
    return all.filter((candidate) =>
      candidate.name.toLowerCase().includes(term),
    );
  }, [candidates, markedByName, search]);

  if (fieldsQuery.isLoading) {
    return <CircularProgress size={20} />;
  }
  if (fieldsQuery.error) {
    return (
      <Alert severity="error">
        Failed to load PII fields: {fieldsQuery.error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        label="Search fields"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <TableContainer sx={{ maxHeight: 480 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">PII</TableCell>
              <TableCell>Field</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Description</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((candidate) => {
              const marked = markedByName.get(candidate.name);
              return (
                <TableRow key={candidate.name} hover>
                  <TableCell padding="checkbox">
                    <input
                      type="checkbox"
                      checked={!!marked}
                      aria-label={`Mark ${candidate.name} as PII`}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const category =
                            guessPiiCategory(candidate.name) ?? "Other";
                          createMutation.mutate({
                            fields: [{ scope, name: candidate.name, category }],
                          });
                        } else if (marked) {
                          deleteMutation.mutate({ id: marked.id });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{candidate.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={marked?.category ?? ""}
                      displayEmpty
                      disabled={!marked}
                      onChange={(e) => {
                        if (!marked) {
                          return;
                        }
                        updateMutation.mutate({
                          id: marked.id,
                          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                          category: e.target.value as PiiCategory,
                        });
                      }}
                    >
                      <MenuItem value="" disabled>
                        -
                      </MenuItem>
                      {Object.values(PiiCategoryEnum).map((category) => (
                        <MenuItem key={category} value={category}>
                          {category}
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {candidate.description ?? ""}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

export function PiiSettings() {
  const [scope, setScope] = useState<PiiFieldScope>(
    PiiFieldScopeEnum.UserProperty,
  );
  const { workspace, memberRoles, authMode } = useAppStorePick([
    "workspace",
    "memberRoles",
    "authMode",
  ]);

  const isAdmin =
    workspace.type === CompletionStatus.Successful &&
    memberRoles.some(
      (role) =>
        role.workspaceId === workspace.value.id &&
        role.role === RoleEnum.Admin,
    );

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Privacy / PII</Typography>
      <Typography variant="body2" color="text.secondary">
        Mark the fields that contain personal data. Members without the
        &quot;Unmask PII&quot; permission see the literal value MASKED instead
        of the underlying data. Plaintext views are written to the audit log.
      </Typography>
      {!isAdmin && (
        <Alert severity="info">
          Only workspace admins can change PII field configuration.
        </Alert>
      )}
      <Tabs
        value={scope}
        onChange={(_event, value: PiiFieldScope) => setScope(value)}
      >
        {Object.values(PiiFieldScopeEnum).map((value) => (
          <Tab key={value} value={value} label={scopeLabels[value]} />
        ))}
      </Tabs>
      {isAdmin ? (
        <PiiScopeEditor scope={scope} />
      ) : (
        <PiiScopeEditorReadOnly scope={scope} />
      )}
      <Box>
        <Typography variant="subtitle2">Plaintext access audit</Typography>
        {isAdmin ? (
          <PiiAuditTable />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Visible to workspace admins only.
          </Typography>
        )}
      </Box>
      {authMode === "single-tenant" && (
        <Alert severity="info">
          Single-tenant deployments always mask PII because there are no member
          roles to grant plaintext access to.
        </Alert>
      )}
    </Stack>
  );
}

function PiiScopeEditorReadOnly({ scope }: { scope: PiiFieldScope }) {
  const fieldsQuery = usePiiFieldsQuery(scope);
  const fields = fieldsQuery.data?.fields ?? [];
  if (fieldsQuery.isLoading) {
    return <CircularProgress size={20} />;
  }
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {fields.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No fields marked as PII.
        </Typography>
      ) : (
        fields.map((field) => (
          <Chip key={field.id} size="small" label={`${field.name} · ${field.category}`} />
        ))
      )}
    </Stack>
  );
}
