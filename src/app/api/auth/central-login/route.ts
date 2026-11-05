import { NextRequest, NextResponse } from 'next/server';
import { centralHealthUser } from '@/lib/centralSso';

export const runtime = 'nodejs';

const centralBaseUrl = (process.env.IMI_SSO_BASE_URL || 'http://127.0.0.1:39001').replace(/\/$/, '');
const centralOrigin = process.env.IMI_SSO_ORIGIN || 'https://appimi.corrientes.gob.ar';

export async function POST(request: NextRequest) {
  const browserOrigin = request.headers.get('origin');
  const localOriginAllowed = process.env.NODE_ENV !== 'production' && browserOrigin === request.nextUrl.origin;
  if (browserOrigin !== centralOrigin && !localOriginAllowed) {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  }
  const credentials = body as { usuario?: unknown; password?: unknown };
  if (typeof credentials.usuario !== 'string' || credentials.usuario.trim().length < 3 || credentials.usuario.length > 100 ||
      typeof credentials.password !== 'string' || credentials.password.length < 1 || credentials.password.length > 256) {
    return NextResponse.json({ error: 'Ingresá usuario y contraseña.' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${centralBaseUrl}/sso/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: centralOrigin },
      body: JSON.stringify({ usuario: credentials.usuario.trim(), password: credentials.password }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return NextResponse.json({ error: 'El servicio de identidad no está disponible. Intentá de nuevo en unos minutos.' }, { status: 503 });
  }

  if (upstream.status === 401) {
    return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 });
  }
  if (upstream.status === 429) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento antes de volver a probar.' }, { status: 429 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: 'El servicio de identidad no pudo validar el ingreso.' }, { status: 503 });
  }

  const setCookie = upstream.headers.get('set-cookie') || '';
  const token = setCookie.match(/(?:^|[,;]\s*)imi_sso=([A-Za-z0-9_-]{43})(?=;|,|$)/)?.[1];
  if (!token) {
    return NextResponse.json({ error: 'El servicio de identidad devolvió una sesión inválida.' }, { status: 502 });
  }

  const healthUser = await centralHealthUser(token);
  if (!healthUser) {
    return NextResponse.json({ error: 'La cuenta no tiene un acceso activo a Salud.' }, { status: 403 });
  }

  const response = NextResponse.json({ usuario: healthUser.username }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set('imi_sso', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
