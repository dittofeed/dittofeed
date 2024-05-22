"use client";

import { DittofeedSdk } from "@dittofeed/sdk-web";
import { User } from "@supabase/supabase-js";
import { useEffect } from "react";

import { useSupabase } from "./supabase-provider";

// Initialize the sdk with a writeKey on startup, which is used to identify your
// workspace. This key can be found at
// https://dittofeed.com/dashboard/settings
if (process.env.NEXT_PUBLIC_DITTOFEED_WRITE_KEY) {
  DittofeedSdk.init({
    writeKey: process.env.NEXT_PUBLIC_DITTOFEED_WRITE_KEY,
    host: process.env.NEXT_PUBLIC_DITTOFEED_HOST,
  });
}

interface UserWithAmr extends User {
  amr: {
    method: string;
    timestamp: number;
  }[];
}

export default function DittofeedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useSupabase();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") {
        // Emit an identify event to Dittofeed when a user signs in
        const user = session.user as UserWithAmr;
        const firstAuthenticatedAt = user.amr[user.amr.length - 1]?.timestamp;
        const traits = {
          ...user,
          firstAuthenticatedAt,
        };

        DittofeedSdk.identify({
          userId: user.id,
          traits,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return <>{children}</>;
}
