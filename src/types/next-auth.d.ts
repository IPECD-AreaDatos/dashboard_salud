import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role?: string;
      cuie_code?: string;
      maternidad_id?: string;
    } & DefaultSession["user"]
  }

  interface User {
    role?: string;
    cuie_code?: string;
    maternidad_id?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    cuie_code?: string;
    maternidad_id?: string;
  }
}
