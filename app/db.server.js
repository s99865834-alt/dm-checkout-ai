import { PrismaClient } from "@prisma/client";
import { runExclusive } from "./lib/prisma-exclusive";

function createPrisma() {
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ args, query }) {
        return runExclusive(() => query(args));
      },
    },
  });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrisma();
  }
}

const prisma = global.prismaGlobal ?? createPrisma();

export default prisma;
