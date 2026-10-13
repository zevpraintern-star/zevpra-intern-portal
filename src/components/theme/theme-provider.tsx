"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Dark/light theme provider.
 *
 * `next-themes` writes the resolved theme to the <html class> before paint, so the
 * 3D hero and every component adapt without a flash of the wrong theme. The choice
 * is persisted in a cookie/localStorage key that contains no personal data.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="ip_theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
