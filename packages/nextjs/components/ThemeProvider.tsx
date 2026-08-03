"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

/**
 * Kallpa es oscuro por definición.
 *
 * El manual de marca no ofrece variante clara: la "noche andina" es el fondo y el oro solo
 * funciona encima de ella. Un modo claro no sería una preferencia del usuario, sería otra
 * marca.
 *
 * Fijar el tema en vez de dejarlo elegir también silencia un aviso de la consola. Para
 * evitar el parpadeo al cargar, la librería de temas inserta una etiqueta `script` dentro
 * del árbol de React, y las versiones nuevas de React advierten que un script escrito así
 * nunca llega a ejecutarse al renderizar en el cliente. Con el tema fijo ese script deja de
 * tener sentido y no se inserta.
 */
export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
};
