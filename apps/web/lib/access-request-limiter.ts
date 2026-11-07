import prisma from "./prisma";

export interface AccessRequestRateLimiter {
  check(input: { ipAddress: string | null; normalizedEmail: string }): Promise<
    "OK" | "IP_RATE_LIMITED" | "EMAIL_RATE_LIMITED"
  >;
}

export class DatabaseAccessRequestRateLimiter implements AccessRequestRateLimiter {
  async check(input: { ipAddress: string | null; normalizedEmail: string }) {
    const now = Date.now();
    if (input.ipAddress) {
      const ipCount = await prisma.accessRequestAttempt.count({
        where: {
          ipAddress: input.ipAddress,
          createdAt: { gte: new Date(now - 60 * 60 * 1000) },
        },
      });
      if (ipCount >= 20) return "IP_RATE_LIMITED" as const;
      const dailyIpCount = await prisma.accessRequestAttempt.count({
        where: {
          ipAddress: input.ipAddress,
          createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
        },
      });
      if (dailyIpCount >= 60) return "IP_RATE_LIMITED" as const;
    }
    const emailCount = await prisma.accessRequestAttempt.count({
      where: {
        normalizedEmail: input.normalizedEmail,
        createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) },
      },
    });
    return emailCount >= 3 ? "EMAIL_RATE_LIMITED" : "OK";
  }
}
