import backendConfig from "backend-lib/src/config";
import logger from "backend-lib/src/logger";
import {
  getRequestContext,
  RequestContextErrorType,
} from "backend-lib/src/requestContext";
import {
  EMAIL_NOT_VERIFIED_PAGE,
  UNAUTHORIZED_PAGE,
  WAITING_ROOM_PAGE,
} from "isomorphic-lib/src/constants";
import { CompletionStatus } from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";

import AppsApi from "./appsApi";
import { GetDFServerSideProps, PropsWithInitialState } from "./types";

export const requestContext: <T>(
  gssp: GetDFServerSideProps<PropsWithInitialState<T>>
) => GetServerSideProps<PropsWithInitialState<T>> =
  (gssp) => async (context) => {
    const rc = await getRequestContext(
      context.req.headers.authorization ?? null
    );
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
            "user not onboarded"
          );
          return {
            redirect: { destination: WAITING_ROOM_PAGE, permanent: false },
          };
        case RequestContextErrorType.Unauthorized:
          logger().info(
            {
              contextErrorMsg: rc.error.message,
            },
            "user unauthorized"
          );
          return {
            redirect: { destination: UNAUTHORIZED_PAGE, permanent: false },
          };
        case RequestContextErrorType.ApplicationError:
          throw new Error(rc.error.message);
      }
    }
    return gssp(context, rc.value);
  };
