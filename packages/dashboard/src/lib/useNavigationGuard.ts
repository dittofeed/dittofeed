import { useRouter } from "next/router";
import { useCallback, useRef, useState } from "react";

export interface UseNavigationGuardResult {
  isNavigating: boolean;
  navigateSafely: (path: string) => Promise<boolean>;
}

/**
 * Hook that provides guarded navigation to prevent double-clicks
 * and race conditions during page transitions.
 */
export function useNavigationGuard(): UseNavigationGuardResult {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationRef = useRef(false);

  const navigateSafely = useCallback(
    async (path: string): Promise<boolean> => {
      // Prevent concurrent navigation using ref (synchronous check)
      if (navigationRef.current) {
        return false;
      }

      navigationRef.current = true;
      setIsNavigating(true);

      try {
        await router.push(path);
        return true;
      } catch (error) {
        console.error("Navigation failed:", error);
        return false;
      } finally {
        navigationRef.current = false;
        setIsNavigating(false);
      }
    },
    [router],
  );

  return { isNavigating, navigateSafely };
}
