// src/types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: string;
      username?: string; // <--- AGREGAR ESTO
      sisa_code?: string;
      cuie_code?: string;
      maternidad_id?: string;
    } & DefaultSession["user"]
  }

  interface User {
    id?: string;
    role?: string;
    username?: string; // <--- AGREGAR ESTO
    sisa_code?: string;
    cuie_code?: string;
    maternidad_id?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    username?: string; // <--- AGREGAR ESTO
    sisa_code?: string;
    cuie_code?: string;
    maternidad_id?: string;
  }
}
