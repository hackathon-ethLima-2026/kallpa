"use client";

import * as React from "react";

/**
 * Kallpa no tiene modo claro, así que tampoco tiene selector de tema.
 *
 * El manual de marca no ofrece variante clara: la "noche andina" es el fondo y el oro solo
 * funciona encima de ella. Un modo claro no sería una preferencia del usuario, sería otra
 * marca. El tema queda fijado en el atributo `data-theme` del documento, que se sirve ya
 * escrito desde el servidor y no necesita JavaScript.
 *
 * Antes aquí vivía la librería de temas. Se quitó porque, para evitar el parpadeo al cargar,
 * inserta una etiqueta `script` dentro del árbol de React, y las versiones nuevas de React
 * avisan por consola que un script escrito así nunca llega a ejecutarse en el cliente. Ese
 * aviso no se puede desactivar desde fuera de la librería, y no tenía sentido cargar con él
 * para resolver un parpadeo entre dos temas cuando solo existe uno.
 *
 * Consecuencia conocida: los componentes del andamiaje que consultan el tema para elegir un
 * ícono reciben un valor vacío y muestran su variante clara. Solo ocurre en las herramientas
 * de desarrollo —`/debug` y `/blockexplorer`— y es un precio menor frente a un error de
 * consola permanente en el producto.
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
