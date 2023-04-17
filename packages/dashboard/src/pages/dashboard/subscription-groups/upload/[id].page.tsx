import { GetServerSideProps } from "next";
import { useRouter } from "next/router";

import { PropsWithInitialState, useAppStore } from "../../../../lib/appStore";
import getSubscriptionGroupsSSP from "../getSubscriptionGroupsSSP";
import SubscriptionGroupLayout, {
  SubscriptionGroupTabLabel,
} from "../subscriptionGroupLayout";

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  getSubscriptionGroupsSSP;

export default function SubscriptionGroupConfig() {
  const path = useRouter();

  const id = typeof path.query.id === "string" ? path.query.id : undefined;

  const workspace = useAppStore((store) => store.workspace);

  if (!id) {
    return null;
  }

  return (
    <SubscriptionGroupLayout
      tab={SubscriptionGroupTabLabel.Upload}
      id={id}
    ></SubscriptionGroupLayout>
  );
}
