// Legacy demo auth. Kept temporarily to avoid breaking imports while
// real Auth.js protection is rolled out across layouts/routes.
export const AUTH_STORAGE_KEY = "sv_authed";

export function isAuthedClient(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

export function setAuthedClient(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, value ? "true" : "false");
}

