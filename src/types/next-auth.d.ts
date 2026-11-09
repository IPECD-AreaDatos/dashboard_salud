// src/types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    origin?: 'central' | 'local';
    authStatus?: 'verified' | 'unavailable';
    user: {
      id?: string;
      role?: string;
      username?: string; // <--- AGREGAR ESTO
      sisa_code?: string | null;
      cuie_code?: string | null;
      maternidad_id?: string | null;
    } & DefaultSession["user"]
  }

  interface User {
    id?: string;
    role?: string;
    username?: string; // <--- AGREGAR ESTO
    sisa_code?: string | null;
    cuie_code?: string | null;
    maternidad_id?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    username?: string; // <--- AGREGAR ESTO
    sisa_code?: string | null;
    cuie_code?: string | null;
    maternidad_id?: string | null;
    centralVerification?: 'verified' | 'unavailable';
  }
}
