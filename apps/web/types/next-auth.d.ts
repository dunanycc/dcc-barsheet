import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      authVersion: number;
      authProvider?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
