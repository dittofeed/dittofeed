import React from "react";
import { useSubscriptionGroupsQuery } from "../lib/useSubscriptionGroupsQuery";

export const SubscriptionGroupsTest: React.FC = () => {
  const { data, isLoading, error } = useSubscriptionGroupsQuery();

  if (isLoading) {
    return <div>Loading subscription groups...</div>;
  }

  if (error) {
    return (
      <div>Error loading subscription groups: {(error as Error).message}</div>
    );
  }

  return (
    <div>
      <h2>Subscription Groups</h2>
      <ul>
        {data?.subscriptionGroups?.map((group) => (
          <li key={group.id}>
            {group.name} - Channel: {group.channel}
          </li>
        ))}
      </ul>
    </div>
  );
};
