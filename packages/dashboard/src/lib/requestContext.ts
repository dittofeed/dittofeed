import { DittofeedSdk } from "@dittofeed/sdk-node";
import backendConfig from "backend-lib/src/config";
import { getFeatures } from "backend-lib/src/features";
import logger from "backend-lib/src/logger";
import {
  getRequestContext,
  RequestContextErrorType,
} from "backend-lib/src/requestContext";
import { OpenIdProfile } from "backend-lib/src/types";
import {
  EMAIL_NOT_VERIFIED_PAGE,
  SINGLE_TENANT_LOGIN_PAGE,
  UNAUTHORIZED_PAGE,
  WAITING_ROOM_PAGE,
} from "isomorphic-lib/src/constants";
import { GetServerSideProps } from "next";

import { apiBase } from "./apiBase";
import { GetDFServerSideProps, PropsWithInitialState } from "./types";

export const requestContext: <T>(
  gssp: GetDFServerSideProps<PropsWithInitialState<T>>,
) => GetServerSideProps<PropsWithInitialState<T>> =
  (gssp) => async (context) => {
    const { profile } = context.req as { profile?: OpenIdProfile };
    const rc = await getRequestContext(context.req.headers, profile);
    if (rc.isErr()) {
      switch (rc.error.type) {
        case RequestContextErrorType.EmailNotVerified:
          logger().info("email not verified");
          return {
            redirect: {
              destination: EMAIL_NOT_VERIFIED_PAGE,
              permanent: false,
            },
          };
        case RequestContextErrorType.NotOnboarded:
          logger().info(
            {
              contextErrorMsg: rc.error.message,
            },
            "user not onboarded",
          );
          return {
            redirect: { destination: WAITING_ROOM_PAGE, permanent: false },
          };
        case RequestContextErrorType.Unauthorized:
          logger().info(
            {
              contextErrorMsg: rc.error.message,
            },
            "user unauthorized",
          );
          return {
            redirect: { destination: UNAUTHORIZED_PAGE, permanent: false },
          };
        case RequestContextErrorType.ApplicationError:
          throw new Error(rc.error.message);
        case RequestContextErrorType.NotAuthenticated:
          if (backendConfig().authMode === "single-tenant") {
            return {
              redirect: {
                destination: SINGLE_TENANT_LOGIN_PAGE,
                permanent: false,
              },
            };
          }
          return {
            redirect: {
              destination: UNAUTHORIZED_PAGE,
              permanent: false,
            },
          };
      }
    }

    const { dashboardWriteKey, trackDashboard } = backendConfig();

    if (dashboardWriteKey && trackDashboard) {
      await DittofeedSdk.init({
        writeKey: dashboardWriteKey,
        host: apiBase(),
      });
    }

    const dfContext = rc.value;
    const features = await getFeatures({
      workspaceId: dfContext.workspace.id,
    });

    DittofeedSdk.identify({
      userId: dfContext.member.id,
      traits: {
        workspaceId: dfContext.workspace.id,
        email: dfContext.member.email,
        firstName: dfContext.member.name,
        nickname: dfContext.member.nickname,
        createdAt: dfContext.member.createdAt,
        emailVerified: dfContext.member.emailVerified,
      },
    });

    return gssp(context, { ...dfContext, features });
  };
