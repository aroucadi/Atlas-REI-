import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // Prevent multiple instances of Prisma Client from being instantiated during hot reloading in dev
  const globalWithPrisma = global as typeof globalThis & {
    prisma?: PrismaClient;
  };
  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = new PrismaClient({
      log: ["warn", "error"],
    });
  }
  prisma = globalWithPrisma.prisma;
}

export { prisma };
