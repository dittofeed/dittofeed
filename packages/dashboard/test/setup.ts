/**
 * Dashboard test setup
 *
 * This file runs before each test file in the dashboard package.
 * It enables Immer plugins that are expected to be globally available
 * in the production app.
 */
import { enableMapSet } from "immer";

// Enable Immer's MapSet plugin globally for all dashboard tests.
// This mirrors the production app where enableMapSet() is called at startup.
enableMapSet();


