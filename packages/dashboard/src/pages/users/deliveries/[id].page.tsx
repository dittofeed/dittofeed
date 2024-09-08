import { Stack } from "@mui/material";
import { toBroadcastResource } from "backend-lib/src/broadcasts";
import { toJourneyResource } from "backend-lib/src/journeys";
import logger from "backend-lib/src/logger";
import { findMessageTemplates } from "backend-lib/src/messaging";
import prisma from "backend-lib/src/prisma";
import { getUsers } from "backend-lib/src/users";
import { CompletionStatus, GetUsersResponse } from "isomorphic-lib/src/types";
import { GetServerSideProps, NextPage } from "next";

import DashboardContent from "../../../components/dashboardContent";
import { DeliveriesTable } from "../../../components/deliveriesTable";
import { SubtleHeader } from "../../../components/headers";
import { UserTabs } from "../../../components/UserTabs";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import { requestContext } from "../../../lib/requestContext";
import { PreloadedState, PropsWithInitialState } from "../../../lib/types";

// ... (rest of the code remains the same)
