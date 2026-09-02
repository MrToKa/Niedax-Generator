"use client";

import type { ReactNode } from "react";

import { LanguageProvider } from "@/lib/i18n";

import { SessionProvider } from "./session-provider";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <LanguageProvider>
      <SessionProvider>{children}</SessionProvider>
    </LanguageProvider>
  );
}
