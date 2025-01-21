import { useQuery } from "@tanstack/react-query";
import {
  Column,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  PaginationState,
  Table,
  useReactTable,
} from "@tanstack/react-table";
import axios from "axios";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  BroadcastResource,
  ChannelType,
  CompletionStatus,
  SavedJourneyResource,
  SearchDeliveriesRequest,
  SearchDeliveriesResponse,
  SearchDeliveriesResponseItem,
  WorkspaceResource,
} from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import {
  defaultGetDeliveriesRequest,
  GetDeliveriesRequest,
} from "./deliveriesTable";

type SortBy =
  | "from"
  | "to"
  | "status"
  | "originName"
  | "templateName"
  | "sentAt";

type SortDirection = "asc" | "desc";

interface State {
  cursor: string | null;
  pageSize: number;
  sortBy: SortBy;
  sortDirection: SortDirection;
}

interface EmailDelivery {
  channel: typeof ChannelType.Email;
  from: string;
  to: string;
  body: string;
  subject?: string;
  replyTo?: string;
}

interface SmsDelivery {
  channel: typeof ChannelType.Sms;
  from: string;
  to: string;
  body: string;
}

interface WebhookDelivery {
  channel: typeof ChannelType.Webhook;
  body: string;
}

type ChannelDelivery = EmailDelivery | SmsDelivery | WebhookDelivery;

type Delivery = {
  userId: string;
  to: string;
  status: string;
  snippet: string;
  originId: string;
  originType: "broadcast" | "journey";
  originName: string;
  templateId: string;
  templateName: string;
  sentAt: number;
  updatedAt: number;
} & ChannelDelivery;

function getOrigin({
  workspace,
  journeys,
  broadcasts,
  item,
}: {
  workspace: WorkspaceResource;
  item: SearchDeliveriesResponseItem;
  journeys: SavedJourneyResource[];
  broadcasts: BroadcastResource[];
}): Pick<Delivery, "originId" | "originType" | "originName"> | null {
  for (const broadcast of broadcasts) {
    if (broadcast.journeyId === item.journeyId) {
      return {
        originId: broadcast.id,
        originType: "broadcast",
        originName: broadcast.name,
      };
    }
  }
  for (const journey of journeys) {
    if (journey.id === item.journeyId) {
      return {
        originId: journey.id,
        originType: "journey",
        originName: journey.name,
      };
    }
  }
  return null;
}

export function DeliveriesTableV2({
  getDeliveriesRequest = defaultGetDeliveriesRequest,
}: {
  getDeliveriesRequest?: GetDeliveriesRequest;
}) {
  const { workspace, apiBase, messages, journeys, broadcasts } =
    useAppStorePick([
      "workspace",
      "messages",
      "apiBase",
      "journeys",
      "broadcasts",
    ]);
  const query = useQuery<SearchDeliveriesResponse | null>({
    queryKey: ["deliveries"],
    queryFn: async () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return null;
      }
      const params: SearchDeliveriesRequest = {
        workspaceId: workspace.value.id,
      };
      const response = await getDeliveriesRequest({
        params,
        apiBase,
      });
      const result = unwrap(
        schemaValidateWithErr(response.data, SearchDeliveriesResponse),
      );
      return result;
    },
  });
  const [state, setState] = useImmer<State>({
    pageSize: 10,
    cursor: null,
    sortBy: "sentAt",
    sortDirection: "desc",
  });
  const columns = useMemo<ColumnDef<Delivery>[]>(() => [], []);
  const data = useMemo<Delivery[] | null>(() => {
    if (
      query.isPending ||
      query.data === null ||
      workspace.type !== CompletionStatus.Successful ||
      journeys.type !== CompletionStatus.Successful
    ) {
      return null;
    }
    return query.data.items.flatMap((item) => {
      const origin = getOrigin({
        workspace: workspace.value,
        journeys: journeys.value,
        broadcasts,
        item,
      });
      if (origin === null) {
        return [];
      }

      return {
        ...item,
        sentAt: new Date(item.sentAt).getTime(),
        updatedAt: new Date(item.updatedAt).getTime(),
      };
    }) satisfies Delivery[];
  }, [query]);
  const table = useReactTable({
    columns: [],
    data: [],
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });
  if (query.isPending || data === null) {
    return <div>Loading...</div>;
  }
  return <div>DeliveriesTableV2</div>;
}
