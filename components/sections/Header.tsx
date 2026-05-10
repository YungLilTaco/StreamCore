"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Cpu, Globe, KeyRound, LogOut, User } from "lucide-react";
import { motion } from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/cn";
import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStreamCoreLocale, setStreamCoreLocale } from "@/components/i18n/I18nProvider";
import { useTranslation } from "react-i18next";
import { pushPathWithChannel, useMaybeSelectedChannel } from "@/components/app/SelectedChannelProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export function Header({ mode = "marketing" }: { mode?: "marketing" | "app" }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useTranslation();
  const channelCtx = useMaybeSelectedChannel();

  const user = session?.user;
  const displayName = user?.name ?? "Account";
  const image = user?.image ?? undefined;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const [locale, setLocale] = React.useState("en");
  const channels = mode === "app" ? (channelCtx?.channels ?? []) : [];
  const resolvedChannelLabel = channels.find((c) => channelCtx?.channelTwitchId === c.channelTwitchId)
    ?.channelDisplayName;

  React.useEffect(() => {
    setLocale(getStreamCoreLocale());
  }, []);

  return (
    <div className="sticky top-0 z-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 to-black/0" />
      <header className="relative border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href={mode === "app" ? "/app" : "/"} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "bg-primary/20 ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(168,85,247,.20),0_18px_50px_rgba(168,85,247,.20)]"
              )}
            >
              <Cpu className="h-5 w-5 text-white" />
            </span>
            <span className="text-base font-semibold tracking-wide text-white">
              Stream<span className="text-white/70">Core</span>
            </span>
          </Link>

          {mode === "marketing" ? (
            <nav className="hidden items-center gap-6 md:flex">
              <a href="#features" className="text-sm text-white/70 hover:text-white">
                Features
              </a>
              <a href="#shared-stream" className="text-sm text-white/70 hover:text-white">
                Shared Stream
              </a>
              <a href="#overlays" className="text-sm text-white/70 hover:text-white">
                Master Overlay
              </a>
            </nav>
          ) : (
            <div className="hidden text-sm text-white/50 md:block">App</div>
          )}

          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3"
          >
            {mode === "marketing" ? (
              <Button
                variant="ghost"
                className="hidden md:inline-flex"
                onClick={() => router.push("/login")}
              >
                <LogIn className="h-4 w-4" />
                Login
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "hidden md:flex items-center gap-3 rounded-xl px-2 py-1.5",
                      "border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={image} alt={displayName} />
                      <AvatarFallback>{initials || "SC"}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 max-w-[200px] flex-col items-start">
                      <div className="w-full truncate text-sm font-semibold text-white/85">{displayName}</div>
                      {resolvedChannelLabel ? (
                        <div className="w-full truncate text-[11px] text-white/45">
                          Channel: <span className="text-white/65">{resolvedChannelLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-[280px]">
                  <DropdownMenuLabel>{t("profile")}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      const self = channels.find((c) => c.isSelf);
                      if (self) pushPathWithChannel("/app/analytics", self.channelTwitchId, router);
                      else router.push("/app/analytics");
                    }}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4 text-white/55" />
                      {t("myChannel")}
                    </span>
                    <span className="text-xs text-white/45">{t("analytics")}</span>
                  </DropdownMenuItem>
                  {channels.length ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t("channels")}</DropdownMenuLabel>
                      {channels.map((c) => (
                        <DropdownMenuItem
                          key={c.channelTwitchId}
                          onSelect={() => channelCtx?.selectChannel(c.channelTwitchId)}
                          className="justify-between"
                        >
                          <span className="truncate">{c.channelDisplayName}</span>
                          <span className="text-[11px] text-white/45">{c.role}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onSelect={() => router.push("/app/permissions")}>
                    <KeyRound className="h-4 w-4 text-white/55" />
                    {t("permissions")}
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <span className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-white/55" />
                        {t("language")}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent side="right" align="start" sideOffset={10}>
                      <DropdownMenuLabel>{t("chooseLanguage")}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={locale}
                        onValueChange={(v) => {
                          setLocale(v);
                          setStreamCoreLocale(v);
                        }}
                      >
                        {[
                          ["en", "English"],
                          ["es", "Spanish"],
                          ["fr", "French"],
                          ["de", "German"],
                          ["pt", "Portuguese"],
                          ["nl", "Dutch"],
                          ["it", "Italian"],
                          ["pl", "Polish"],
                          ["tr", "Turkish"],
                          ["ja", "Japanese"]
                        ].map(([id, label]) => (
                          <DropdownMenuRadioItem key={id} value={id}>
                            {label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={async () => {
                      await signOut({ callbackUrl: "/" });
                    }}
                    className="text-red-200 focus:text-red-100"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="primary"
              className="shadow-glow-purple"
              onClick={() => {
                if (mode === "marketing") {
                  router.push("/login");
                } else {
                  window.location.hash = "cta";
                }
              }}
            >
              {mode === "marketing" ? "Get Started" : "Upgrade"}
            </Button>
          </motion.div>
        </div>
      </header>
    </div>
  );
}

