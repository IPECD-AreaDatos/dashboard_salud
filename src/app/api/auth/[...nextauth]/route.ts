// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { centralHealthUser, verifyCentralHealthUser } from "@/lib/centralSso";
import { query } from "@/lib/db"; // 👈 Para resolver el nombre del efector

// Helper para obtener el nombre institucional según rol y códigos
async function obtenerNombreInstitucion(user: any): Promise<string | null> {
  if (!user) return null;
  const role = user.role;
  const sisa = user.sisa_code;
  const cuie = user.cuie_code;
  const matId = user.maternidad_id;

  try {
    if (role === "Centro de Salud") {
      if (sisa || cuie) {
        const res = await query(
          `SELECT nombre FROM efectores_sisa 
           WHERE (codigo_sisa = $1 AND $1 <> '') OR (cuie = $2 AND $2 <> '') 
           LIMIT 1`,
          [sisa || "", cuie || ""]
        );
        if (res.rows.length > 0 && res.rows[0].nombre) {
          return res.rows[0].nombre;
        }
      }
    } else if (role === "Maternidad") {
      if (matId) {
        const res = await query(
          `SELECT nombre FROM maternidades WHERE id = $1 LIMIT 1`,
          [matId]
        );
        if (res.rows.length > 0 && res.rows[0].nombre) {
          return res.rows[0].nombre;
        }
      }
      if (sisa) {
        const res = await query(
          `SELECT nombre FROM efectores_sisa WHERE codigo_sisa = $1 LIMIT 1`,
          [sisa]
        );
        if (res.rows.length > 0 && res.rows[0].nombre) {
          return res.rows[0].nombre;
        }
      }
    }
  } catch (error) {
    console.error("Error al obtener nombre de institución en auth:", error);
  }

  return null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "imi-central",
      name: "Portal IMI",
      credentials: {},
      async authorize(_credentials, request) {
        const header = request.headers?.cookie || "";
        const pair = header.split(";").map((item: string) => item.trim()).find((item: string) => /^imi_sso=[A-Za-z0-9_-]{43}$/.test(item));
        return await centralHealthUser(pair?.slice(8));
      }
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user?.centralUsername) {
        token.centralUsername = user.centralUsername;
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
        token.sisa_code = user.sisa_code;
        token.cuie_code = user.cuie_code;
        token.maternidad_id = user.maternidad_id;
        token.centralVerification = 'verified';

        // 🌟 Resolvemos el nombre formal del centro
        const nombreEst = await obtenerNombreInstitucion(user);
        token.institucionNombre = nombreEst || user.name || user.username;
        return token;
      }

      if (!token.centralUsername) throw new Error('La sesión de Salud no es válida');
      const jar = await cookies();
      const verification = await verifyCentralHealthUser(jar.get('imi_sso')?.value);
      if (verification.status === 'unavailable') {
        token.centralVerification = 'unavailable';
        return token;
      }
      if (verification.status !== 'verified' || verification.user.centralUsername !== token.centralUsername || (token.id && String(verification.user.id) !== String(token.id))) {
        throw new Error('Sesión central no válida');
      }

      user = verification.user;
      token.centralVerification = 'verified';
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
        token.sisa_code = user.sisa_code;
        token.cuie_code = user.cuie_code;
        token.maternidad_id = user.maternidad_id;

        if (!token.institucionNombre) {
          const nombreEst = await obtenerNombreInstitucion(user);
          token.institucionNombre = nombreEst || user.name || user.username;
        }
      }
      return token;
    },

    async session({ session, token }: any) {
      if (session.user) {
        session.origin = token.centralUsername ? 'central' : 'local';
        session.authStatus = token.centralVerification === 'unavailable' ? 'unavailable' : 'verified';
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.username = token.username;
        session.user.sisa_code = token.sisa_code;
        session.user.cuie_code = token.cuie_code;
        session.user.maternidad_id = token.maternidad_id;

        // 🌟 Asignamos el nombre formal a session.user.name y una propiedad explícita
        session.user.institucionNombre = token.institucionNombre || token.username;
        session.user.name = token.institucionNombre || token.username;
      }
      return session;
    }
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  secret: process.env.NEXTAUTH_SECRET || "ipec-salud-secret-2026",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };