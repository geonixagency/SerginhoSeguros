"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app/shell";
import { AnimatedLogo } from "@/components/brand/animated-logo";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background" role="status" aria-label="Carregando">
        <AnimatedLogo uid="boot" className="size-24 animate-pulse" animate={false} />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
