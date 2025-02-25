import type { Argv } from "yargs";

export interface CommandDefinition {
  command: string;
  description: string;
  builder?: (yargs: Argv) => Argv;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (argv: any) => void | Promise<void>;
}
