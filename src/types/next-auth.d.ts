import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      username: string;
      sessionVersion?: number;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    username: string;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    username: string;
    sessionVersion?: number;
  }
}
