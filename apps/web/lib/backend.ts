export const BACKEND_BASE_URL =
  process.env.SNAPSPACE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

export function backendUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_BASE_URL}${normalized}`;
}
