import {
  parseTableFilters,
  serializeTableFilters,
  TableFilters,
} from "isomorphic-lib/src/tableFilters";
import { useRouter } from "next/router";
import { useCallback, useMemo } from "react";

// Keeps a table's advanced filters in a URL query param so filtered views can
// be bookmarked and shared. Use a distinct paramName when a page renders more
// than one filterable table.
export function useTableFiltersUrlState(
  paramName = "filters",
): [TableFilters, (filters: TableFilters) => void] {
  const router = useRouter();
  const rawParam = router.query[paramName];

  const filters = useMemo(() => parseTableFilters(rawParam), [rawParam]);

  const setFilters = useCallback(
    (next: TableFilters) => {
      const { [paramName]: _existing, ...rest } = router.query;
      const serialized = serializeTableFilters(next);
      router.replace(
        {
          pathname: router.pathname,
          query: serialized ? { ...rest, [paramName]: serialized } : rest,
        },
        undefined,
        { shallow: true },
      );
    },
    [router, paramName],
  );

  return [filters, setFilters];
}
