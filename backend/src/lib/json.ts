import type { Prisma } from '@prisma/client';

export const toPrismaJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
