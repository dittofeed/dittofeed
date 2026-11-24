// jsdom does not provide TextEncoder/TextDecoder, but some modules imported by
// the shared test setup (e.g. `pg`) require them at load time.
import { TextDecoder, TextEncoder } from "util";

Object.assign(global, { TextEncoder, TextDecoder });
