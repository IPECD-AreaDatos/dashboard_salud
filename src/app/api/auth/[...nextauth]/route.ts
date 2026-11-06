// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { centralHealthUser } from "@/lib/centralSso";

// 1. Extraemos la configuración para que sea exportable
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "imi-central",
      name: "Portal IMI",
      credentials: {},
      async authorize(_credentials, request) {
        const header=request.headers?.cookie || "";
        const pair=header.split(";").map((item: string)=>item.trim()).find((item: string)=>/^imi_sso=[A-Za-z0-9_-]{43}$/.test(item));
        return await centralHealthUser(pair?.slice(8));
      }
    }),
  ],
  // 2. Callbacks: Pasan el rol de la DB al Token y luego a la Sesión
  callbacks: {
    async jwt({ token, user }: any) {
      if (user?.centralUsername) token.centralUsername = user.centralUsername;
      if (!token.centralUsername) throw new Error('La sesión de Salud no es válida');
      const jar = await cookies();
      const verified = await centralHealthUser(jar.get('imi_sso')?.value);
      if (!verified || verified.centralUsername !== token.centralUsername || (token.id && String(verified.id) !== String(token.id))) throw new Error('Sesión central no válida');
      user = verified;
      if (user) {
        token.id = user.id; // 👈 SOLUCIÓN: Guardamos el ID en el JWT mapeado
        token.role = user.role;
        token.username = user.username; // Lo metemos en el JWT
        token.sisa_code = user.sisa_code;
        token.cuie_code = user.cuie_code;
        token.maternidad_id = user.maternidad_id;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.origin = token.centralUsername ? 'central' : 'local';
        session.user.id = token.id; // 👈 SOLUCIÓN: Exponemos el ID en la sesión activa para el Frontend/Backend
        session.user.role = token.role;
        session.user.username = token.username; // Lo exponemos en la sesión
        session.user.sisa_code = token.sisa_code;
        session.user.cuie_code = token.cuie_code;
        session.user.maternidad_id = token.maternidad_id;
      }
      return session;
    }
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  secret: process.env.NEXTAUTH_SECRET || "ipec-salud-secret-2026",
};

// 3. El handler sigue siendo el mismo, pero usa la constante
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
