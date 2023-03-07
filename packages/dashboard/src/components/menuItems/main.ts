import {
  ApartmentOutlined,
  BarChartOutlined,
  BookOutlined,
  DatabaseOutlined,
  GroupOutlined,
  MessageOutlined,
  ReadOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { MenuItemGroup } from "./types";

// ==============================|| MENU ITEMS ||============================== //

const menuItems: { items: MenuItemGroup[] } = {
  items: [
    {
      id: "reporting",
      title: "Reporting",
      type: "group",
      children: [
        {
          id: "analysis",
          title: "Analysis",
          type: "item",
          url: "/dashboard/analysis",
          icon: BarChartOutlined,
          disabled: true,
          description: "Analyze metrics across your entire workspace.",
        },
      ],
    },
    {
      id: "messaging",
      title: "Messaging",
      type: "group",
      children: [
        {
          id: "journeys",
          title: "Journeys",
          type: "item",
          url: "/dashboard/journeys",
          icon: ApartmentOutlined,
          description: "View and, create, and edit user journeys.",
        },
        {
          id: "deliveries",
          title: "Deliveries and Drafts",
          type: "item",
          url: "/dashboard/deliveries",
          icon: SendOutlined,
          disabled: true,
          description: "View a feed of messages sent to users.",
        },
      ],
    },
    {
      id: "audience",
      title: "Audience",
      type: "group",
      children: [
        {
          id: "people",
          title: "Users",
          type: "item",
          url: "/dashboard/users",
          icon: UserOutlined,
          disabled: true,
          description: "View users, and their histories.",
        },
        {
          id: "events",
          title: "Events",
          type: "item",
          url: "/dashboard/events",
          icon: ThunderboltOutlined,
          description: "View user events.",
        },
        {
          id: "segments",
          title: "Segments",
          type: "item",
          url: "/dashboard/segments",
          icon: GroupOutlined,
          description: "View, create, and edit segments.",
        },
      ],
    },
    {
      id: "content",
      title: "Content",
      type: "group",
      children: [
        {
          id: "messages",
          title: "Message Templates",
          type: "item",
          url: "/dashboard/templates",
          icon: BookOutlined,
          description: "View, create, and edit message templates.",
        },
        {
          id: "collections",
          title: "Collections",
          type: "item",
          url: "/dashboard/collections",
          disabled: true,
          icon: DatabaseOutlined,
          description: "Use your business data in your messages.",
        },
      ],
    },
    {
      id: "support",
      title: "Support",
      type: "group",
      children: [
        {
          id: "documentation",
          title: "Documentation",
          type: "item",
          url: "https://docs.dittofeed.com",
          icon: ReadOutlined,
          external: true,
          description:
            "Documentation with instructions and guidelines on how to use Dittofeed.",
        },
        {
          id: "contact",
          title: "Contact Us",
          type: "item",
          url: "/dashboard/contact",
          icon: MessageOutlined,
          description: "Contact details.",
        },
      ],
    },
  ],
};

export default menuItems;
