import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from './api/auth/[...nextauth]/route';
import LandingClient from './LandingClient';

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ salir?: string }>;
}) {
  const manualLogin = (await searchParams).salir === '1';
  const central = (await cookies()).get('imi_sso')?.value;
  const checkPortal = !manualLogin && !!central && /^[A-Za-z0-9_-]{43}$/.test(central);
  if (checkPortal) {
    const session = await getServerSession(authOptions);
    if (session?.origin === 'central') redirect(session.user?.role === 'Primeros Latidos' ? '/dashboard/primeros-latidos' : '/dashboard');
  }
  return <LandingClient checkPortal={checkPortal} />;
}
