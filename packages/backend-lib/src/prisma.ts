import { PrismaClient } from "@prisma/client";

import prismaConfig from "./prisma/config";

const prisma = new PrismaClient(prismaConfig);

export default prisma;
