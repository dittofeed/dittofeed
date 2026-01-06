// Setup file for jsdom tests
// jsdom 27 requires TextEncoder/TextDecoder which may not be available
// in all jest environments, so we polyfill them from Node's util module

import { TextEncoder, TextDecoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;
