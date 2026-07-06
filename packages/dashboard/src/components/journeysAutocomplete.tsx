import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { useMemo } from "react";

import { useResourcesQuery } from "../lib/useResourcesQuery";

export interface SimpleJourney {
  id: string;
  name: string;
}

function getJourneyLabel(journey: SimpleJourney) {
  return journey.name;
}

export type JourneyChangeHandler = (journey: SimpleJourney | null) => void;

export function JourneysAutocomplete({
  journeyId,
  disabled,
  handler,
  label = "Journey",
}: {
  journeyId?: string;
  disabled?: boolean;
  handler: JourneyChangeHandler;
  label?: string;
}) {
  const { data: queryData, isLoading } = useResourcesQuery({ journeys: true });

  const journeyItems: SimpleJourney[] = useMemo(() => {
    return queryData?.journeys ?? [];
  }, [queryData]);

  const journey = useMemo(() => {
    const found = journeyItems.find((j) => j.id === journeyId);
    if (found) {
      return found;
    }
    if (journeyId) {
      return { id: journeyId, name: journeyId };
    }
    return null;
  }, [journeyItems, journeyId]);

  return (
    <Autocomplete
      value={journey}
      options={journeyItems}
      disabled={disabled || isLoading}
      getOptionLabel={getJourneyLabel}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      onChange={(_event, j) => {
        handler(j);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          variant="outlined"
          InputLabelProps={{
            shrink: true,
          }}
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
