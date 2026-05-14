import { Suspense } from "react";
import { LoginClient } from "./login-client";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const rawFrom = sp.from;
  const from = typeof rawFrom === "string" ? rawFrom : "/app";
  const rawCb = sp.callbackUrl;
  const callbackUrlHint =
    typeof rawCb === "string" &&
    rawCb.startsWith("/") &&
    !rawCb.startsWith("//") &&
    rawCb.startsWith("/app")
      ? rawCb
      : undefined;
  const authError = typeof sp.error === "string" ? sp.error : undefined;
  let errorDescription: string | undefined;
  if (typeof sp.error_description === "string") {
    try {
      errorDescription = decodeURIComponent(sp.error_description);
    } catch {
      errorDescription = sp.error_description;
    }
  }

  return (
    <Suspense>
      <LoginClient
        from={from}
        callbackUrlHint={callbackUrlHint}
        authError={authError}
        errorDescription={errorDescription}
      />
    </Suspense>
  );
}

