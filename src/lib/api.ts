export const apiFetch = (endpoint: string, options?: RequestInit) => {
  // Si el endpoint no empieza con /, se lo agregamos
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // En producción usamos el prefijo, en local Next.js lo maneja solo con basePath
  return fetch(`/salud-dashboard/api${path}`, options);
};
