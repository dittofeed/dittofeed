import { useEffect, useRef } from "react";

/**
 * Custom hook to run an effect exactly once, only after a specific condition becomes true.
 *
 * @param {Function} callback The effect function to run.
 * @param {boolean} condition The condition that must be true for the effect to run.
 */
function useOnceWhen(callback: () => void, condition: boolean) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (condition && !hasRun.current) {
      callback();
      hasRun.current = true;
    }
  }, [condition, callback]); // Depend on condition and callback to ensure it reacts when condition becomes true
}

export default useOnceWhen;
