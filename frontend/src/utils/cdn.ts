// CDN URL normalization utilities
// Ensures idempotent prefixing and clean URLs for image src usage.

const DEFAULT_CDN = 'https://cdn.serelix.xyz';

export const CDN_BASE: string =
  ((import.meta as any).env?.VITE_PUBLIC_CDN_URL as string | undefined)?.trim()?.replace(/\/$/, '') ||
  DEFAULT_CDN;

/**
 * Normalize a URL or path to a fully-qualified CDN URL.
 * - If already absolute (http/https or data:), returns as-is.
 * - Otherwise, prefixes with CDN_BASE and cleans duplicate slashes.
 */
export function normalizeCdnUrl(input: string | null | undefined): string {
  const u = (input || '').trim();
  if (!u) return '';
  if (/^(data:|https?:\/\/)/i.test(u)) return u; // already absolute

  // Handle protocol-relative URLs (e.g., //cdn.example.com/...) by making https explicit
  if (/^\/\//.test(u)) return 'https:' + u;

  // Backward-compat: old paths like "/ig_rendered/..." should live under "/uploads/ig_rendered/..."
  let pathOnly = u;
  if (u.startsWith('/ig_rendered/')) {
    pathOnly = '/uploads' + u; // -> /uploads/ig_rendered/...
  } else if (u.startsWith('ig_rendered/')) {
    pathOnly = '/uploads/' + u.replace(/^\/+/, '');
  } else if (/^\/?public\//.test(u)) {
    // Ensure public assets are served from /uploads/public/...
    pathOnly = '/' + u.replace(/^\/+/, '');
    if (!pathOnly.startsWith('/uploads/')) {
      pathOnly = '/uploads' + pathOnly;
    }
  }

  // Join with CDN base
  const base = CDN_BASE.replace(/\/$/, '');
  const path = pathOnly.startsWith('/') ? pathOnly : '/' + pathOnly;
  // Collapse any accidental duplicate slashes after the domain
  const joined = base + path;
  return joined.replace(/([^:\/])\/+/g, (m, p1) => p1 + '/');
}
