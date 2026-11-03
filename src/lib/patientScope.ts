/** Genera restricciones para la cuenta de salud; los valores nunca se interpolan. */
export function patientScope(user: { role?: string | null; sisa_code?: string | null; cuie_code?: string | null; maternidad_id?: string | number | null } | undefined, offset = 1) {
  if (!user) return { sql: 'FALSE', params: [] as unknown[] };
  const role=user.role;
  if (role !== 'Centro de Salud' && role !== 'Maternidad') return { sql: 'TRUE', params: [] as unknown[] };
  const params: unknown[]=[]; const parts: string[]=[];
  if (user.sisa_code) { params.push(user.sisa_code); const n=params.length+offset; parts.push(`(p.sisa_centro_salud = $${n} OR p.sisa_centro_derivado = $${n})`); }
  else if (user.cuie_code) { params.push(user.cuie_code); const n=params.length+offset; parts.push(`(p.sisa_centro_salud = $${n} OR p.sisa_centro_salud IN (SELECT codigo_sisa FROM efectores_sisa WHERE cuie = $${n}) OR p.cuie_seguimiento = $${n})`); }
  if (role === 'Maternidad' && user.maternidad_id) { params.push(user.maternidad_id); parts.push(`p.derivacion_maternidad_id = $${params.length+offset}`); }
  return { sql: parts.length ? `(${parts.join(' OR ')})` : 'FALSE', params };
}
