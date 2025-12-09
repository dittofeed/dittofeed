# Users Pagination Fix

See [./AGENDA.md](./AGENDA.md) for generic coding advice.

Help me fix the following UX bug.

## Symptoms

- Under some conditions, after some combination of pagination actions (next, and previous page button clicks), the page freezes up and becomes unresponsive, indicating some kind of infinite loop or recursion.
- The previous button doesn't actually seem to go to the previous page, but rather deliveries an entirely different page.

## Relevant Files

- packages/dashboard/src/components/usersTableV2.tsx

## Steps

1. Read through the code and provide an initial diagnosis of the problem.
2. Abstract the users filtering, sorting, and pagination into a separate store, with all of the state, actions, and logic for these features.
  2.a. This store should use zustand, and its immer middleware.
  2.b. We should create a new instance of the store for each users table instance (it is not global). If you need guidance regarding how to do this see the following code.

```typescript
import type { UseBoundStore, StoreApi } from 'zustand'
import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Higher-order function to create a context provider and a custom hook for a given Zustand store.
 * 
 * @param createStore - A factory function that creates a new Zustand store.
 * @returns A tuple containing the context provider and the custom hook.
 */
export function createStoreContext<TState>(createStore: () => UseBoundStore<StoreApi<TState>>) {

  /**
   * React context created to provide the Zustand store to components. 
   * This context will hold the Zustand store created by `createStore`.
   */
  const StoreContext = createContext<UseBoundStore<StoreApi<TState>>>(createStore());

  /**
   * React component that provides the Zustand store to its children components. 
   * It uses the `createStore` function to create a store instance and provides it via `StoreContext`.
   */
  const StoreProvider:React.FC<{ children: ReactNode }> = ({ children }) => {
    const [ useStore ] = useState(createStore);
    return (
      <StoreContext.Provider value={useStore}>
        {children}
      </StoreContext.Provider>
    ) 
  };

  /**
   * Custom hook that provides access to the Zustand store within components. 
   * It uses `useContext` to access the store from `RowStoreContext` and returns the hook returned by the Zustand store.
   */
  const useStore = () => {
    const useStore = useContext(StoreContext);
    return useStore();
  };

  return [ StoreProvider, useStore ] as const;
}
```

which is used as follows (note this is just an example, not directly applicable to our code):

```typescript
// In typescript, optionally set the state type
type CounterStoreState = {
  counter: number,
  setCounter: (newNumber: number) => void
}

// Create the store you want to use
const createCounterStore = () => create<CounterStoreState>(
  (set, get) => ({
    counter: 0,
    setCounter: (newNumber) => {
      set({ counter: newNumber })
    }
  })
)

// First is the React Context provider to wrap your components in, second is the hook to directly access the store
const [ CounterStoreProvider, useCounterStore ] = createStoreContext(createCounterStore)
```


3. Create a test for our new store. 
  2.a. Should seed the database with users.
  2.b. Should circumvent the API by mocking API calls like the calls to get users and user counts, with calls directly to the methods in packages/backend-lib/src/users.ts.
  2.c. Use packages/backend-lib/src/users.test.ts as a guide for scaffolding code.