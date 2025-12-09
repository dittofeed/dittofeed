import type { StoreApi, UseBoundStore } from "zustand";
import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Higher-order function to create a context provider and a custom hook for a given Zustand store.
 *
 * This enables creating per-component-instance stores (not global singletons) by wrapping
 * components with a provider that creates a fresh store instance.
 *
 * @param createStore - A factory function that creates a new Zustand store.
 * @returns A tuple containing the context provider and the custom hook.
 *
 * @example
 * ```typescript
 * // Create the store factory
 * const createCounterStore = () => create<CounterState>()(
 *   immer((set) => ({
 *     counter: 0,
 *     increment: () => set((state) => { state.counter += 1; }),
 *   }))
 * );
 *
 * // Create the provider and hook
 * const [CounterStoreProvider, useCounterStore] = createStoreContext(createCounterStore);
 *
 * // Use in a component
 * function Counter() {
 *   const { counter, increment } = useCounterStore();
 *   return <button onClick={increment}>{counter}</button>;
 * }
 *
 * // Wrap with provider (each provider instance gets its own store)
 * function App() {
 *   return (
 *     <CounterStoreProvider>
 *       <Counter />
 *     </CounterStoreProvider>
 *   );
 * }
 * ```
 */
export function createStoreContext<TState>(
  createStore: () => UseBoundStore<StoreApi<TState>>,
) {
  /**
   * React context created to provide the Zustand store to components.
   * This context will hold the Zustand store created by `createStore`.
   * The default value creates a store so the hook works even outside a provider.
   */
  const StoreContext = createContext<UseBoundStore<StoreApi<TState>> | null>(
    null,
  );

  /**
   * React component that provides the Zustand store to its children components.
   * It uses the `createStore` function to create a store instance and provides it via `StoreContext`.
   */
  const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Using useState with initializer function ensures the store is only created once
    const [useStore] = useState(createStore);
    return (
      <StoreContext.Provider value={useStore}>
        {children}
      </StoreContext.Provider>
    );
  };

  /**
   * Custom hook that provides access to the Zustand store within components.
   * It uses `useContext` to access the store from `StoreContext` and returns the store state.
   *
   * @throws Error if used outside of a StoreProvider
   */
  function useStore(): TState;
  function useStore<T>(selector: (state: TState) => T): T;
  function useStore<T>(selector?: (state: TState) => T): TState | T {
    const store = useContext(StoreContext);
    if (!store) {
      throw new Error("useStore must be used within a StoreProvider");
    }
    if (selector) {
      return store(selector);
    }
    return store();
  }

  /**
   * Hook to get the raw store API for advanced use cases
   */
  const useStoreApi = () => {
    const store = useContext(StoreContext);
    if (!store) {
      throw new Error("useStoreApi must be used within a StoreProvider");
    }
    return store;
  };

  return [StoreProvider, useStore, useStoreApi] as const;
}

