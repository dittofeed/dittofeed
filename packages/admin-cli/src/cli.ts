import yargs from "yargs";

export async function cli() {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs
    .scriptName("admin")
    .usage("$0 <cmd> [args]")
    .command(
      "hello [name]",
      "welcome ter yargs!",
      (yargsInner) => {
        yargsInner.positional("name", {
          type: "string",
          default: "Cambi",
          describe: "the name to say hello to",
        });
      },
      (argv) => {
        console.log("hello", argv.name, "welcome to yargs!");
      }
    )
    .demandCommand(1, "# Please provide a valid command")
    .help().argv;
}
