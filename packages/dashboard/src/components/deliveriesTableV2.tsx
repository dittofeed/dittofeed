import {
  Column,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  Table,
  useReactTable,
} from "@tanstack/react-table";
import { ChannelType } from "isomorphic-lib/src/types";
import { useMemo } from "react";
import { useImmer } from "use-immer";

interface State {}

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

export function DeliveriesTableV2() {
  const [state, setState] = useImmer<State>({});
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
