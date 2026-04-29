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
            "SELECT * FROM usuarios WHERE username = $1", 
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
              name: user.username, 
              role: user.role 
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
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.role = token.role;
      }
      return session;
    }
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET || "ipec-salud-secret-2026",
};

// 3. El handler sigue siendo el mismo, pero usa la constante
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };