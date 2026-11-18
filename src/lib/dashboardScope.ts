type ScopedUser = {
  role?: string | null;
  sisa_code?: string | null;
  cuie_code?: string | null;
  maternidad_id?: string | number | null;
};

/** Mantiene el alcance del tablero y pasa sus valores por parámetros SQL. */
export function dashboardScope(user: ScopedUser | undefined, offset = 0, includeDerivedCenter = false) {
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${offset + params.length}`;
  };

  if (user?.role === 'Centro de Salud') {
    if (user.sisa_code) {
      const code = bind(user.sisa_code);
      return { sql: includeDerivedCenter
        ? `(p.sisa_centro_salud = ${code} OR p.sisa_centro_derivado = ${code})`
        : `p.sisa_centro_salud = ${code}`, params };
    }
    if (user.cuie_code) {
      const code = bind(user.cuie_code);
      return { sql: `(p.sisa_centro_salud = ${code} OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = ${code}) OR p.cuie_seguimiento = ${code})`, params };
    }
    return { sql: 'FALSE', params };
  }

  if (user?.role === 'Maternidad') {
    const parts: string[] = [];
    if (user.sisa_code) {
      parts.push(`p.sisa_centro_salud = ${bind(user.sisa_code)}`);
    } else if (user.cuie_code) {
      const code = bind(user.cuie_code);
      parts.push(`(p.sisa_centro_salud = ${code} OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = ${code}))`);
    }
    if (user.maternidad_id) parts.push(`p.derivacion_maternidad_id = ${bind(user.maternidad_id)}`);
    return { sql: parts.length ? `(${parts.join(' OR ')})` : 'FALSE', params };
  }

  return { sql: 'TRUE', params };
}
