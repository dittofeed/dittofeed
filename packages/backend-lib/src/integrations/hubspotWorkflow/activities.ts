import { OauthToken } from "@prisma/client";
import axios from "axios";
import { HUBSPOT_OAUTH_TOKEN } from "isomorphic-lib/src/constants";

import config from "../../config";
import prisma from "../../prisma";

export async function getOauthToken({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<OauthToken | null> {
  return prisma().oauthToken.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name: HUBSPOT_OAUTH_TOKEN,
      },
    },
  });
}

export async function refreshToken({
  workspaceId,
  token,
}: {
  workspaceId: string;
  token: string;
}): Promise<OauthToken> {
  const { dashboardUrl, hubspotClientSecret, hubspotClientId } = config();

  const formData = {
    grant_type: "refresh_token",
    client_id: hubspotClientId,
    client_secret: hubspotClientSecret,
    redirect_uri: `${dashboardUrl}/dashboard/oauth2/callback/hubspot`,
    refresh_token: token,
  };

  const tokenResponse = await axios({
    method: "post",
    url: "https://api.hubapi.com/oauth/v1/token",
    data: formData,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  const oauthToken = prisma().oauthToken.upsert({
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
  return oauthToken;
}
