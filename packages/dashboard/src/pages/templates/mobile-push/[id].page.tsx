import { GetServerSideProps } from "next";

import { requestContext } from "../../../lib/requestContext";
import { PropsWithInitialState } from "../../../lib/types";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (_ctx, _dfContext) => ({
    notFound: true,
  }));

export default function MessageEditor() {
  return <>placeholder</>;
}
