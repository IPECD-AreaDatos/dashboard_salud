import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

type HealthSession = Session & {
  authStatus?: 'verified' | 'unavailable';
};

type HealthAuthResult =
  | { ok: true; session: HealthSession }
  | { ok: false; response: NextResponse };

export const DASHBOARD_ROLES = ['Administrador', 'Coordinador', 'Centro de Salud', 'Maternidad', 'Supervisora', 'Lectura'];

export async function requireHealthSession(allowedRoles: readonly string[] = [...DASHBOARD_ROLES, 'Primeros Latidos']): Promise<HealthAuthResult> {
  const session = await getServerSession(authOptions) as HealthSession | null;

  if (session?.authStatus === 'unavailable') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No se pudo validar tu sesión con el servicio de identidad. Reintentá en unos minutos.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }

  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'La sesión de Salud venció o dejó de estar habilitada. Iniciá sesión nuevamente.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }

  if (!allowedRoles.includes(session.user.role || '')) {
    return { ok: false, response: NextResponse.json({ error: 'Perfil sin permiso para este recurso.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) };
  }

  return { ok: true, session };
}
