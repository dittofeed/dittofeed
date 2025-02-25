import type { Argv } from "yargs";

import { CommandDefinition } from "./types";

export async function registerCommands(
  parser: Argv,
  commandDefinitions: CommandDefinition[],
) {
  // Register all commands
  for (const { command, description, builder, handler } of commandDefinitions) {
    if (builder) {
      parser.command(command, description, builder, handler);
    } else {
      parser.command(command, description, handler);
    }
  }
  return parser;
}
