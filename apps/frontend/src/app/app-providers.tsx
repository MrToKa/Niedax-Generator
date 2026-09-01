"use client";

import type { ReactNode } from "react";

import { LanguageProvider } from "@/lib/i18n";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
