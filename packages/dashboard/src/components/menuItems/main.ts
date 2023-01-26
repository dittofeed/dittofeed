import {
  ApartmentOutlined,
  BarChartOutlined,
  BookOutlined,
  DatabaseOutlined,
  GroupOutlined,
  MessageOutlined,
  ReadOutlined,
  SendOutlined,
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
          target: true,
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
          target: true,
          icon: ApartmentOutlined,
          description: "View and, create, and edit user journeys.",
        },
        {
          id: "deliveries",
          title: "Deliveries and Drafts",
          type: "item",
          url: "/dashboard/deliveries",
          target: true,
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
          target: true,
          icon: UserOutlined,
          disabled: true,
          description: "View users, and their histories.",
        },
        {
          id: "segments",
          title: "Segments",
          type: "item",
          url: "/dashboard/segments",
          target: true,
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
          target: true,
          icon: BookOutlined,
          description: "View, create, and edit message templates.",
        },
        {
          id: "collections",
          title: "Collections",
          type: "item",
          url: "/dashboard/collections",
          target: true,
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
          url: "/dashboard/documentation",
          icon: ReadOutlined,
          disabled: true,
          description:
            "Documentation with instructions and guidelines on how to use Dittofeed.",
        },
        {
          id: "contact",
          title: "Contact Us",
          type: "item",
          url: "/dashboard/contact",
          target: true,
          icon: MessageOutlined,
          description: "Contact details.",
        },
      ],
    },
  ],
};

export default menuItems;
