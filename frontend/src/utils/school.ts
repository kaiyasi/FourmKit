/**
 *
 */
export type School = { id: number; slug: string; name: string; logo_path?: string | null };

const KEY = 'selected_school_slug';

/**
 *
 */
export function getSelectedSchoolSlug(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 *
 */
export function setSelectedSchoolSlug(slug: string | null) {
  try {
    if (!slug) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, slug);
  } catch {}
}

/**
 *
 */
export function isCrossSchool(): boolean {
  return !getSelectedSchoolSlug();
}

