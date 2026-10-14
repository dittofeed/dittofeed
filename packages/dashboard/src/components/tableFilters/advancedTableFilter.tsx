import { AddCircleOutline } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  ButtonProps,
  Chip,
  MenuItem,
  Popover,
  Stack,
  SxProps,
  TextField,
  Theme,
} from "@mui/material";
import {
  TABLE_FILTER_OPERATOR_LABELS,
  TABLE_FILTER_OPERATORS_BY_TYPE,
  TableFilter,
  TableFilterFieldType,
  TableFilterOperator,
  TableFilters,
  tableFilterValues,
} from "isomorphic-lib/src/tableFilters";
import React, { useMemo, useState } from "react";

export interface TableFilterOption {
  id: string;
  label: string;
}

export interface TableFilterFieldConfig {
  key: string;
  label: string;
  type: TableFilterFieldType;
  // Required for Enum fields.
  options?: TableFilterOption[];
}

interface Draft {
  field: string;
  operator: TableFilterOperator;
  values: string[];
}

const VALUELESS_OPERATORS: TableFilterOperator[] = ["IsEmpty", "IsNotEmpty"];

const INPUT_TYPES: Record<TableFilterFieldType, string> = {
  String: "text",
  Number: "number",
  Date: "datetime-local",
  Enum: "text",
};

function emptyDraft(field: TableFilterFieldConfig): Draft {
  return {
    field: field.key,
    operator: TABLE_FILTER_OPERATORS_BY_TYPE[field.type][0] ?? "Equals",
    values: [],
  };
}

function draftFromFilter(filter: TableFilter, type: TableFilterFieldType) {
  const values = tableFilterValues(filter);
  return {
    field: filter.field,
    operator: filter.operator,
    // datetime-local inputs need "YYYY-MM-DDTHH:mm" in local time.
    values:
      type === "Date"
        ? values.map((v) => {
            const d = new Date(v);
            return Number.isNaN(d.getTime())
              ? ""
              : new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);
          })
        : values,
  };
}

function draftToFilter(
  draft: Draft,
  type: TableFilterFieldType,
): TableFilter | null {
  const { field, operator } = draft;
  if (VALUELESS_OPERATORS.includes(operator)) {
    return { field, operator };
  }
  const values = draft.values
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((v) => (type === "Date" ? new Date(v).toISOString() : v));

  switch (operator) {
    case "In":
    case "NotIn":
      return values.length > 0 ? { field, operator, value: values } : null;
    case "Between":
      return values.length === 2 && draft.values.length === 2
        ? { field, operator, value: values }
        : null;
    default:
      return values[0] !== undefined
        ? { field, operator, value: values[0] }
        : null;
  }
}

function filterLabel(
  filter: TableFilter,
  field: TableFilterFieldConfig | undefined,
): string {
  const operatorLabel = TABLE_FILTER_OPERATOR_LABELS[filter.operator];
  const fieldLabel = field?.label ?? filter.field;
  if (VALUELESS_OPERATORS.includes(filter.operator)) {
    return `${fieldLabel} ${operatorLabel}`;
  }
  const values = tableFilterValues(filter).map((v) => {
    if (field?.type === "Date") {
      return new Date(v).toLocaleString();
    }
    return field?.options?.find((o) => o.id === v)?.label ?? v;
  });
  const valueLabel =
    filter.operator === "Between" ? values.join(" – ") : values.join(", ");
  return `${fieldLabel} ${operatorLabel} ${valueLabel}`;
}

function FilterEditor({
  fields,
  initial,
  onApply,
}: {
  fields: TableFilterFieldConfig[];
  initial: Draft;
  onApply: (filter: TableFilter) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const field = fields.find((f) => f.key === draft.field) ?? fields[0];
  if (!field) {
    return null;
  }
  const operators = TABLE_FILTER_OPERATORS_BY_TYPE[field.type];
  const result = draftToFilter(draft, field.type);

  const setValue = (index: number, value: string) =>
    setDraft((d) => {
      const values = [...d.values];
      values[index] = value;
      return { ...d, values };
    });

  let valueInput: React.ReactNode = null;
  if (!VALUELESS_OPERATORS.includes(draft.operator)) {
    if (field.type === "Enum") {
      const options = field.options ?? [];
      valueInput = (
        <Autocomplete
          multiple
          size="small"
          options={options}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={options.filter((o) => draft.values.includes(o.id))}
          onChange={(_e, selected) =>
            setDraft((d) => ({ ...d, values: selected.map((o) => o.id) }))
          }
          renderInput={(params) => <TextField {...params} label="Values" />}
        />
      );
    } else {
      const inputType = INPUT_TYPES[field.type];
      const inputCount = draft.operator === "Between" ? 2 : 1;
      const inputLabels = inputCount === 2 ? ["From", "To"] : ["Value"];
      valueInput = (
        <Stack direction="row" spacing={1}>
          {Array.from({ length: inputCount }, (_, i) => (
            <TextField
              key={i}
              size="small"
              type={inputType}
              label={inputLabels[i]}
              InputLabelProps={
                field.type === "Date" ? { shrink: true } : undefined
              }
              value={draft.values[i] ?? ""}
              onChange={(e) => setValue(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && result) {
                  e.preventDefault();
                  onApply(result);
                }
              }}
              autoFocus={i === 0}
              fullWidth
            />
          ))}
        </Stack>
      );
    }
  }

  return (
    <Stack spacing={1.5} sx={{ p: 2, width: 360 }}>
      <Stack direction="row" spacing={1}>
        <TextField
          select
          size="small"
          label="Field"
          value={field.key}
          onChange={(e) => {
            const next = fields.find((f) => f.key === e.target.value);
            if (next) {
              setDraft(emptyDraft(next));
            }
          }}
          sx={{ flex: 1 }}
        >
          {fields.map((f) => (
            <MenuItem key={f.key} value={f.key}>
              {f.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Operator"
          value={draft.operator}
          onChange={(e) => {
            const operator = operators.find((o) => o === e.target.value);
            if (operator) {
              setDraft((d) => ({ ...d, operator }));
            }
          }}
          sx={{ flex: 1 }}
        >
          {operators.map((o) => (
            <MenuItem key={o} value={o}>
              {TABLE_FILTER_OPERATOR_LABELS[o]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {valueInput}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          size="small"
          disabled={!result}
          onClick={() => result && onApply(result)}
        >
          Apply
        </Button>
      </Box>
    </Stack>
  );
}

interface EditorState {
  anchor: HTMLElement;
  // Index of the filter being edited, or null when adding a new one.
  index: number | null;
}

// "Add Filter" button plus removable/editable chips for the active filters.
// Filters are AND'ed together.
export function AdvancedTableFilter({
  fields,
  filters,
  onChange,
  buttonProps,
  chipSx,
}: {
  fields: TableFilterFieldConfig[];
  filters: TableFilters;
  onChange: (filters: TableFilters) => void;
  buttonProps?: ButtonProps;
  chipSx?: SxProps<Theme>;
}) {
  const [editor, setEditor] = useState<EditorState | null>(null);

  const initialDraft = useMemo(() => {
    const firstField = fields[0];
    if (!editor || !firstField) {
      return null;
    }
    const existing = editor.index !== null ? filters[editor.index] : undefined;
    const existingField = existing
      ? fields.find((f) => f.key === existing.field)
      : undefined;
    return existing && existingField
      ? draftFromFilter(existing, existingField.type)
      : emptyDraft(firstField);
  }, [editor, filters, fields]);

  const handleApply = (filter: TableFilter) => {
    if (editor?.index !== null && editor?.index !== undefined) {
      onChange(filters.map((f, i) => (i === editor.index ? filter : f)));
    } else {
      onChange([...filters, filter]);
    }
    setEditor(null);
  };

  return (
    <>
      <Button
        startIcon={<AddCircleOutline />}
        variant="contained"
        color="info"
        {...buttonProps}
        onClick={(e) => setEditor({ anchor: e.currentTarget, index: null })}
      >
        Add Filter
      </Button>
      {filters.map((filter, index) => (
        <Chip
          // eslint-disable-next-line react/no-array-index-key
          key={`${filter.field}-${index}`}
          sx={chipSx}
          label={filterLabel(
            filter,
            fields.find((f) => f.key === filter.field),
          )}
          onClick={(e) => setEditor({ anchor: e.currentTarget, index })}
          onDelete={() => onChange(filters.filter((_, i) => i !== index))}
        />
      ))}
      <Popover
        open={Boolean(editor)}
        anchorEl={editor?.anchor}
        onClose={() => setEditor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {initialDraft && (
          <FilterEditor
            // Remount when switching between filters so the draft resets.
            key={editor?.index ?? "new"}
            fields={fields}
            initial={initialDraft}
            onApply={handleApply}
          />
        )}
      </Popover>
    </>
  );
}
