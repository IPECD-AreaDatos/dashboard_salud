// src/types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role?: string;
      sisa_code?: string;
      cuie_code?: string;
      maternidad_id?: string;
    } & DefaultSession["user"]
  }

  interface User {
    role?: string;
    sisa_code?: string;
    cuie_code?: string;
    maternidad_id?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    sisa_code?: string;
    cuie_code?: string;
    maternidad_id?: string;
  }
}
