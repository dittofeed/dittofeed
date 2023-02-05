import { PrismaClient } from "@prisma/client";

import buildConfig from "./prisma/buildConfig";

const prisma = new PrismaClient(buildConfig());

export default prisma;
