import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const centralBaseUrl = (process.env.IMI_SSO_BASE_URL || 'http://127.0.0.1:39001').replace(/\/$/, '');
const centralOrigin = process.env.IMI_SSO_ORIGIN || 'https://appimi.corrientes.gob.ar';

export async function POST(request: NextRequest) {
  const browserOrigin = request.headers.get('origin');
  const localOriginAllowed = process.env.NODE_ENV !== 'production' && browserOrigin === request.nextUrl.origin;
  if (browserOrigin !== centralOrigin && !localOriginAllowed) {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  }

  const token = request.cookies.get('imi_sso')?.value;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    try {
      const upstream = await fetch(`${centralBaseUrl}/sso/logout`, {
        method: 'POST',
        headers: { cookie: `imi_sso=${token}`, Origin: centralOrigin },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3000),
      });
      if (!upstream.ok) {
        console.warn('Salud SSO: el servicio central no confirmó el cierre de sesión', upstream.status);
      }
    } catch {
      console.warn('Salud SSO: no se pudo contactar al servicio central para cerrar la sesión');
    }
  }

  // Aunque el servicio central no responda, quitar la cookie local impide que
  // Salud vuelva a crear automáticamente la sesión en la próxima visita.
  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set('imi_sso', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
