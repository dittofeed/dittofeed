import {
  ApartmentOutlined,
  BarChartOutlined,
  BookOutlined,
  GroupOutlined,
  MessageOutlined,
  ReadOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  CampaignOutlined,
  InboxOutlined,
  ManageAccountsOutlined,
  PeopleOutlined,
} from "@mui/icons-material";

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
          url: "/analysis/messages",
          icon: BarChartOutlined,
          description: "Analyze metrics across your entire workspace.",
        },
        {
          id: "deliveries",
          title: "Deliveries",
          type: "item",
          url: "/deliveries",
          icon: InboxOutlined,
          description: "See which messages were delivered to which users.",
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
          url: "/journeys",
          icon: ApartmentOutlined,
          description: "View and, create, and edit user journeys.",
        },
        {
          id: "messages",
          title: "Message Templates",
          type: "item",
          url: "/templates",
          icon: BookOutlined,
          description: "View, create, and edit message templates.",
        },
        {
          id: "broadcasts",
          title: "Broadcasts",
          type: "item",
          url: "/broadcasts",
          icon: CampaignOutlined,
          description: "Broadcast one off messages to users.",
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
          url: "/users",
          icon: UserOutlined,
          description: "View users, and their histories.",
        },
        {
          id: "segments",
          title: "Segments",
          type: "item",
          url: "/segments",
          icon: GroupOutlined,
          description: "View, create, and edit segments.",
        },
        {
          id: "user-properties",
          title: "User Properties",
          type: "item",
          url: "/user-properties",
          icon: ManageAccountsOutlined,
          description:
            "Manage the properties which are recorded and computed for users.",
        },
        {
          id: "subscription-groups",
          title: "Subscription Groups",
          type: "item",
          url: "/subscription-groups",
          icon: PeopleOutlined,
          description: "Manage subscription groups of users.",
        },
        {
          id: "events",
          title: "Events",
          type: "item",
          url: "/events",
          icon: ThunderboltOutlined,
          description: "View user events.",
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
          url: "/contact",
          icon: MessageOutlined,
          description: "Contact details.",
        },
      ],
    },
  ],
};

export default menuItems;
