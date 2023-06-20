import { Static, Type } from "@sinclair/typebox";

export const FcmKey = Type.Object({
  project_id: Type.String(),
  client_email: Type.String(),
  private_key: Type.String(),
});

export type FcmKey = Static<typeof FcmKey>;
