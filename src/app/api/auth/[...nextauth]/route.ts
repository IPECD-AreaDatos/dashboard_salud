// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { query } from "@/lib/db";
import bcrypt from "bcrypt"; // Volvemos a bcrypt nativo

// 1. Extraemos la configuración para que sea exportable
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        usuario: { label: "Usuario", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.usuario || !credentials?.password) return null;

        try {
          const res = await query(
            `SELECT u.*, 
                    COALESCE(m.nombre, e.nombre) as nombre_oficial
             FROM usuarios u
             LEFT JOIN maternidades m ON u.maternidad_id = m.id
             LEFT JOIN efectores_sisa e ON (u.sisa_code = e.codigo_sisa OR u.cuie_code = e.cuie)
             WHERE u.username = $1`,
            [credentials.usuario.trim()]
          );

          const user = res.rows[0];
          if (!user) return null;

          const storedHash = user.password_hash.trim();
          const providedPassword = credentials.password.trim();

          console.log("Comparando:", providedPassword, "contra", storedHash);

          const match = await bcrypt.compare(providedPassword, storedHash);

          if (match) {
            // Retornamos el objeto usuario con el rol incluido
            return {
              id: user.id.toString(),
              name: user.nombre_oficial || user.username,
              username: user.username, // <--- ESTO ES LO QUE ESTABA FALTANDO
              role: user.role,
              sisa_code: user.sisa_code,
              cuie_code: user.cuie_code,
              maternidad_id: user.maternidad_id
            };
          }

          return null;
        } catch (error) {
          console.error("Error en authorize:", error);
          return null;
        }
      }
    })
  ],
  // 2. Callbacks: Pasan el rol de la DB al Token y luego a la Sesión
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
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