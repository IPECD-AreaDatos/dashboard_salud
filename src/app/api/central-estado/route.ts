import { NextRequest, NextResponse } from 'next/server';
import { centralHealthUser } from '@/lib/centralSso';
export async function GET(request: NextRequest) {
  const linked = await centralHealthUser(request.cookies.get('imi_sso')?.value);
  return NextResponse.json({ disponible: !!linked, primerosLatidos: linked?.role === 'Primeros Latidos' }, { headers: { 'Cache-Control': 'no-store' } });
}
