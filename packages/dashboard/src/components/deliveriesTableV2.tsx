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
import {
  ChannelType,
  CompletionStatus,
  SearchDeliveriesRequest,
} from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { useImmer } from "use-immer";

import { useAppStorePick } from "../lib/appStore";
import {
  defaultGetDeliveriesRequest,
  GetDeliveriesRequest,
} from "./deliveriesTable";

type SortBy =
  | "sentAt"
  | "updatedAt"
  | "from"
  | "to"
  | "status"
  | "originType"
  | "templateName";

type SortDirection = "asc" | "desc";

interface Sort {
  by: SortBy;
  direction: SortDirection;
}

interface State {
  cursor: string | null;
  sort: Sort[];
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
  const query = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      if (workspace.type !== CompletionStatus.Successful) {
        return [];
      }
      const params: SearchDeliveriesRequest = {
        workspaceId: workspace.value.id,
      };
      // FIXME remaining filter params
      const response = await getDeliveriesRequest({
        params,
        apiBase,
      });
      return response.data;
    },
  });
  const [state, setState] = useImmer<State>({
    pagination: {
      pageIndex: 0,
      pageSize: 10,
      cursor: null,
    },
  });
  const columns = useMemo<ColumnDef<Delivery>[]>(() => [], []);
  const data = useMemo<Delivery[]>(() => [], []);
  const table = useReactTable({
    columns: [],
    data: [],
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });
  return <div>DeliveriesTableV2</div>;
}
