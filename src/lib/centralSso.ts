import { query } from './db';

export async function centralHealthUser(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const response=await fetch('http://127.0.0.1:39001/sso/me',{headers:{cookie:`imi_sso=${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(1500)});
    if (!response.ok) return null;
    const data: unknown=await response.json();
    if (!data || typeof data !== 'object') return null;
    const session=data as {usuario?:unknown;tableros?:unknown};
    if (typeof session.usuario!=='string' || !Array.isArray(session.tableros)) return null;
    const salud = session.tableros.find((board: unknown) =>
      board && typeof board === 'object' && (board as {codigo?:unknown}).codigo === 'salud'
    ) as { rango?: unknown } | undefined;
    const rango = String(salud?.rango || '').toLowerCase();
    if (!['acceso','admin'].includes(rango)) return null;

    // El rango central admin ya concede el rol Administrador de Salud.
    // No requiere una segunda cuenta ni un vínculo a public.usuarios.
    if (rango === 'admin') {
      return {
        id: `central:${session.usuario}`,
        name: session.usuario,
        username: session.usuario,
        role: 'Administrador',
        sisa_code: null,
        cuie_code: null,
        maternidad_id: null,
        centralUsername: session.usuario
      };
    }

    const result=await query(`SELECT u.id,u.username,u.role,u.sisa_code,u.cuie_code,u.maternidad_id, COALESCE(m.nombre,e.nombre,u.username) AS nombre_oficial
      FROM imi_sso_vinculos v JOIN usuarios u ON u.id=v.usuario_salud_id
      LEFT JOIN maternidades m ON u.maternidad_id=m.id LEFT JOIN efectores_sisa e ON (u.sisa_code=e.codigo_sisa OR u.cuie_code=e.cuie)
      WHERE v.usuario_central=$1 AND v.activo LIMIT 1`,[session.usuario]);
    const user=result.rows[0];
    if (!user || !['Administrador','Coordinador','Centro de Salud','Maternidad','Lectura','Supervisora','Primeros Latidos'].includes(user.role)) return null;
    if (user.role==='Centro de Salud' && !user.sisa_code && !user.cuie_code) return null;
    if (user.role==='Maternidad' && !user.sisa_code && !user.cuie_code && !user.maternidad_id) return null;
    return { id:String(user.id), name:user.nombre_oficial, username:user.username, role:user.role, sisa_code:user.sisa_code, cuie_code:user.cuie_code, maternidad_id:user.maternidad_id, centralUsername:session.usuario };
  } catch { return null; }
}
