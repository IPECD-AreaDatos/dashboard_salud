const IMI_SSO_BASE_URL = (process.env.IMI_SSO_BASE_URL || 'http://127.0.0.1:39001').replace(/\/$/, '');

export async function centralHealthUser(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const response=await fetch(`${IMI_SSO_BASE_URL}/sso/me`,{headers:{cookie:`imi_sso=${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(2500)});
    if (!response.ok) {
      console.warn('Salud SSO: consulta de sesión central rechazada', response.status);
      return null;
    }
    const data: unknown=await response.json();
    if (!data || typeof data !== 'object') return null;
    const session=data as {usuario?:unknown;nombres?:unknown;apellidos?:unknown;tableros?:unknown};
    if (typeof session.usuario!=='string' || !Array.isArray(session.tableros)) {
      console.warn('Salud SSO: formato de sesión central inesperado');
      return null;
    }
    const salud = session.tableros.find((board: unknown) =>
      board && typeof board === 'object' && (board as {codigo?:unknown}).codigo === 'salud'
    ) as { rango?: unknown; alcances?: unknown } | undefined;
    const displayName = [session.nombres, session.apellidos]
      .filter((part): part is string => typeof part === 'string' && !!part.trim())
      .map(part => part.trim())
      .join(' ') || session.usuario;
    const rango = String(salud?.rango || '').toLowerCase();
    if (!['admin','coordinador','centro-salud','maternidad','lectura','supervisora','primeros-latidos'].includes(rango)) {
      console.warn('Salud SSO: sin rango de Salud compatible');
      return null;
    }

    // El rango central admin ya concede el rol Administrador de Salud.
    // No requiere una segunda cuenta ni un vínculo a public.usuarios.
    if (rango === 'admin') {
      return {
        id: `central:${session.usuario}`,
        name: displayName,
        username: session.usuario,
        role: 'Administrador',
        sisa_code: null,
        cuie_code: null,
        maternidad_id: null,
        centralUsername: session.usuario
      };
    }

    const roleByRange: Record<string, string> = {
      coordinador: 'Coordinador',
      'centro-salud': 'Centro de Salud',
      maternidad: 'Maternidad',
      lectura: 'Lectura',
      supervisora: 'Supervisora',
      'primeros-latidos': 'Primeros Latidos',
    };
    const centralRole = roleByRange[rango];
    if (centralRole) {
      const scopes = Array.isArray(salud?.alcances) ? salud.alcances as unknown[] : [];
      const values = new Map<string, string>();
      for (const item of scopes) {
        if (!item || typeof item !== 'object') continue;
        const scope = item as { tipo?: unknown; valor?: unknown };
        if (typeof scope.tipo === 'string' && typeof scope.valor === 'string' && scope.valor.trim()) {
          if (['sisa', 'cuie', 'maternidad'].includes(scope.tipo)) values.set(scope.tipo, scope.valor.trim());
        }
      }
      const sisa_code = values.get('sisa') || null;
      const cuie_code = values.get('cuie') || null;
      const maternidad_id = values.get('maternidad') || null;
      if (centralRole === 'Centro de Salud' && !sisa_code && !cuie_code) {
        console.warn('Salud SSO: faltan alcances de centro de salud');
        return null;
      }
      if (centralRole === 'Maternidad' && !sisa_code && !cuie_code && !maternidad_id) {
        console.warn('Salud SSO: faltan alcances de maternidad');
        return null;
      }
      return {
        id: `central:${session.usuario}`,
        name: displayName,
        username: session.usuario,
        role: centralRole,
        sisa_code,
        cuie_code,
        maternidad_id,
        centralUsername: session.usuario
      };
    }

  } catch {
    console.warn('Salud SSO: no se pudo completar la consulta central');
    return null;
  }
}
