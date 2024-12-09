import { bootstrapWithDefaults } from "backend-lib/src/bootstrap";
import { Argv } from "yargs";

export const BOOTSTRAP_OPTIONS = {
  "workspace-name": {
    type: "string",
    alias: "n",
    describe: "The workspace name to bootstrap.",
  },
  "workspace-domain": {
    type: "string",
    alias: "d",
    describe:
      "The email domain to authorize. All users with the provided email domain will be able to access the workspace. Example: -d=example.com",
  },
  "workspace-type": {
    type: "string",
    alias: "t",
    describe: "The type of workspace to create.",
    choices: ["Root", "Parent"],
    default: "Root",
  },
} as const;

export function boostrapOptions(cmd: Argv) {
  return cmd.options(BOOTSTRAP_OPTIONS);
}

export const bootstrapHandler = bootstrapWithDefaults;
