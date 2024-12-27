// eslint-disable-next-line filenames/no-index
import { drizzle } from "drizzle-orm/node-postgres";

import config from "../config";

const db = drizzle(config().databaseUrl);

export default db;
