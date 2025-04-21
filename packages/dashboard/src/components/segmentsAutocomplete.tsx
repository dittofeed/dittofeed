import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { useMemo } from "react";

import { useSegmentsQuery } from "../lib/useSegmentResourcesQuery";
import { ResourceTypeEnum } from "isomorphic-lib/src/types";

// Define a simpler type based on observed/inferred data structure
export interface SimpleSegment {
  id: string;
  name: string;
}

function getSegmentLabel(sg: SimpleSegment) {
  return sg.name;
}

export type SegmentChangeHandler = (segment: SimpleSegment | null) => void;

export function SegmentsAutocomplete({
  segmentId,
  disabled,
  handler,
}: {
  segmentId?: string;
  disabled?: boolean;
  handler: SegmentChangeHandler;
}) {
  const { data: queryData, isLoading } = useSegmentsQuery();

  const segmentItems: SimpleSegment[] = useMemo(() => {
    const segments = queryData?.segments;
    if (!segments) {
      return [];
    }
    return segments;
  }, [queryData]);

  const segment = useMemo(() => {
    return (
      segmentItems.find((sg: SimpleSegment) => sg.id === segmentId) ?? null
    );
  }, [segmentItems, segmentId]);

  return (
    <Autocomplete
      value={segment}
      options={segmentItems}
      disabled={disabled || isLoading}
      getOptionLabel={getSegmentLabel}
      onChange={(_event, s) => {
        handler(s);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Segment"
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
