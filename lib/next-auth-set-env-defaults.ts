import { setEnvDefaults as coreSetEnvDefaults } from "@auth/core";
import type { NextAuthConfig } from "next-auth";

/**
 * Mirrors `next-auth/lib/env#setEnvDefaults` so App Router route handlers can call `Auth()`
 * without relying on deep imports that are not in `package.json#exports`.
 */
export function applyNextAuthEnvDefaults(config: NextAuthConfig): void {
  try {
    if (!config.secret) {
      config.secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    }
    const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    if (url) {
      const { pathname } = new URL(url);
      if (pathname !== "/") {
        config.basePath ||= pathname;
      }
    }
  } catch {
    /* fall through to finally */
  } finally {
    config.basePath ||= "/api/auth";
    coreSetEnvDefaults(process.env, config, true);
  }
}
