import { DittofeedSdk } from "@dittofeed/sdk-node";
import backendConfig from "backend-lib/src/config";
import { getFeatures } from "backend-lib/src/features";
import logger from "backend-lib/src/logger";
import { getRequestContext } from "backend-lib/src/requestContext";
import { OpenIdProfile, RequestContextErrorType } from "backend-lib/src/types";
import {
  SINGLE_TENANT_LOGIN_PAGE,
  UNAUTHORIZED_PAGE,
} from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { GetServerSideProps } from "next";

import { apiBase } from "./apiBase";
import { GetDFServerSideProps, PropsWithInitialState } from "./types";

export const requestContext: <T>(
  gssp: GetDFServerSideProps<PropsWithInitialState<T>>,
) => GetServerSideProps<PropsWithInitialState<T>> =
  (gssp) => async (context) => {
    const { profile } = context.req as { profile?: OpenIdProfile };
    logger().debug(
      {
        profile,
      },
      "loc6",
    );
    const rc = await getRequestContext(context.req.headers, profile);
    const { onboardingUrl } = backendConfig();
    if (rc.isErr()) {
      const { error } = rc;
      switch (error.type) {
        case RequestContextErrorType.EmailNotVerified:
          logger().info(
            {
              onboardingUrl,
              email: error.email,
            },
            "email not verified",
          );
          return {
            redirect: {
              destination: onboardingUrl,
              basePath: false,
              permanent: false,
            },
          };
        case RequestContextErrorType.NotOnboarded:
          logger().info(
            {
              contextErrorMsg: error.message,
            },
            "user not onboarded",
          );
          return {
            redirect: {
              destination: onboardingUrl,
              permanent: false,
              basePath: false,
            },
          };
        case RequestContextErrorType.Unauthorized: {
          logger().info(
            {
              contextErrorMsg: error.message,
            },
            "user unauthorized",
          );

          return {
            redirect: {
              destination: error.action.url,
              permanent: false,
              basePath: false,
            },
          };
        }
        case RequestContextErrorType.ApplicationError:
          throw new Error(error.message);
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
        case RequestContextErrorType.WorkspaceInactive:
          logger().info(
            {
              contextErrorMsg: error.message,
              workspace: error.workspace,
            },
            "workspace inactive",
          );
          return {
            redirect: { destination: UNAUTHORIZED_PAGE, permanent: false },
          };
        default:
          assertUnreachable(error);
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
