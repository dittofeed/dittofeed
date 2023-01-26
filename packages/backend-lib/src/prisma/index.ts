import { PrismaClient } from "@prisma/client";

import prismaConfig from "./config";

const prisma = new PrismaClient(prismaConfig);

export default prisma;
