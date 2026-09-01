import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "./app-providers";
import "./styles.css";

export const metadata: Metadata = {
  title: "Niedax Generator",
  description: "Bilingual route planning and bill of materials application"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="bg">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
