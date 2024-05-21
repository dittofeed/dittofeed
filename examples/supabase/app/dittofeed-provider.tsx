"use client";

import { DittofeedSdk } from "@dittofeed/sdk-web";
import { useEffect } from "react";

import { useSupabase } from "./supabase-provider";

// Initialize the sdk with a writeKey, which is used to identify your
// workspace. This key can be found at
// https://dittofeed.com/dashboard/settings
if (process.env.NEXT_PUBLIC_DITTOFEED_WRITE_KEY) {
  DittofeedSdk.init({
    writeKey: process.env.NEXT_PUBLIC_DITTOFEED_WRITE_KEY,
    host: process.env.NEXT_PUBLIC_DITTOFEED_HOST,
  });
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
        const { user } = session;
        DittofeedSdk.identify({
          userId: user.id,
          traits: user,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, Math.random()]);
  return <>{children}</>;
}
