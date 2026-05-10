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

  return (
    <Suspense>
      <LoginClient from={from} />
    </Suspense>
  );
}

