import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const auditRoles = ['Administrador', 'Coordinador', 'Centro de Salud', 'Maternidad', 'Lectura'];

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!auditRoles.includes(session?.user?.role || '')) {
    redirect('/dashboard');
  }
  return children;
}
