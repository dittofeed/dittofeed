import { OauthToken } from "@prisma/client";
import axios, { AxiosError } from "axios";
import { HUBSPOT_OAUTH_TOKEN } from "isomorphic-lib/src/constants";
import { Overwrite } from "utility-types";

import config from "../../config";
import logger from "../../logger";
import prisma from "../../prisma";

// prevents temporal from automatically serializing Dates to strings
export type SerializableOauthToken = Overwrite<
  OauthToken,
  { createdAt: number; updatedAt: number | null }
>;

export async function getOauthToken({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SerializableOauthToken | null> {
  const token = await prisma().oauthToken.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name: HUBSPOT_OAUTH_TOKEN,
      },
    },
  });
  if (!token) {
    return null;
  }
  return {
    ...token,
    updatedAt: token.updatedAt.getTime() ?? null,
    createdAt: token.createdAt.getTime(),
  };
}

interface RefreshForm {
  grant_type: "refresh_token";
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  refresh_token: string;
}

export async function refreshToken({
  workspaceId,
  token,
}: {
  workspaceId: string;
  token: string;
}): Promise<SerializableOauthToken> {
  const { dashboardUrl, hubspotClientSecret, hubspotClientId } = config();

  if (!hubspotClientId || !hubspotClientSecret) {
    throw new Error("Hubspot client id or secret not set");
  }
  const formData: RefreshForm = {
    grant_type: "refresh_token",
    client_id: hubspotClientId,
    client_secret: hubspotClientSecret,
    redirect_uri: `${dashboardUrl}/dashboard/oauth2/callback/hubspot`,
    refresh_token: token,
  };

  try {
    const tokenResponse = await axios({
      method: "post",
      url: "https://api.hubapi.com/oauth/v1/token",
      data: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const oauthToken = await prisma().oauthToken.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: HUBSPOT_OAUTH_TOKEN,
        },
      },
      create: {
        workspaceId,
        name: HUBSPOT_OAUTH_TOKEN,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
      },
    });
    return {
      ...oauthToken,
      createdAt: oauthToken.createdAt.getTime(),
      updatedAt: oauthToken.updatedAt.getTime() ?? null,
    };
  } catch (e) {
    const err = e as AxiosError;
    logger().error(
      {
        err,
        errBody: err.response?.data,
      },
      "Error refreshing Hubspot token"
    );
    throw e;
  }
}
