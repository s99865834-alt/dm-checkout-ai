import { PrismaClient } from "@prisma/client";
import { runExclusive } from "./lib/prisma-exclusive";
import { encryptSessionArgs, decryptSessionResult } from "./lib/session-crypto.server";

function createPrisma() {
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        // Shopify tokens are encrypted at rest. Doing it here rather than in
        // PrismaSessionStorage keeps the session library untouched and covers
        // the migration scripts that go through the same client.
        if (model === "Session") {
          const result = await runExclusive(() => query(encryptSessionArgs(operation, args)));
          return decryptSessionResult(operation, result);
        }
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
