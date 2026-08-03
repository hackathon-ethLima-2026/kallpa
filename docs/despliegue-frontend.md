# Publicar el frontend

En vivo: <https://kallpa-one.vercel.app>

Los contratos ya viven en Arbitrum Sepolia (`docs/addresses.md`) y no se vuelven a tocar
para publicar la aplicación. Lo único que se despliega aquí es la interfaz.

## Qué necesita de verdad

Una sola credencial: el identificador de proyecto de WalletConnect.

La clave de Alchemy **no hace falta**. `scaffold.config.ts` redirige las lecturas de
Arbitrum Sepolia al punto de acceso público y oficial de la red mediante `rpcOverrides`,
así que la aplicación nunca llama a Alchemy. La clave compartida que trae el proyecto base
está saturada y devolvía `Failed to fetch` a mitad de una lectura, que es peor que una
caída limpia: la interfaz se queda a medias sin decir por qué.

WalletConnect sí importa. El proyecto base trae un identificador compartido por todo el
mundo que lo usa, y de él depende el botón de conectar cuando alguien entra desde una
billetera de teléfono. Es lo primero que toca quien evalúa la aplicación, así que conviene
que no dependa de una cuota ajena.

Se saca gratis en <https://cloud.reown.com> — crear proyecto, copiar el _Project ID_.

## Publicar

El repositorio está conectado al proyecto de Vercel, así que **publicar es hacer `push` a
`main`**. No hace falta ningún comando.

La configuración vive en el `vercel.json` de la raíz: instala con el candado de la raíz
(`yarn install --immutable`) y compila el espacio de trabajo del frontend. El
`.vercelignore` deja fuera lo que no participa —sin él viajarían gigabytes de artefactos
de compilación de Rust.

La credencial ya está registrada en el proyecto. Para cambiarla:

```bash
printf '<el identificador>' | yarn vercel env add NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID production
```

### Por qué se compila desde la raíz y no desde el paquete

Vale la pena entenderlo porque costó dos despliegues fallidos.

Desplegar con `vercel` desde `packages/nextjs` sube **solo esa carpeta**, así que
`yarn install` corre sin el candado de la raíz y resuelve versiones frescas en lugar de las
probadas. El candado fija `@coinbase/cdp-sdk` en 1.51.0 —entra por el conector de billetera
de RainbowKit—; sin él se instalaba una versión más nueva que importa `@x402/*`, paquetes
que nadie declara, y la compilación moría con ocho `Module not found`.

Lo grave no era el error sino lo que revelaba: la máquina de quien programa y el servidor
estaban instalando árboles de dependencias distintos. Un despliegue así funciona hoy y
revienta el jueves sin que nadie haya tocado una línea.

Queda además un `resolutions` en `packages/nextjs/package.json` que fija esa misma versión.
Yarn 3 lo ignora en un paquete hijo, así que no hace nada aquí: solo protege a quien
despliegue por línea de comandos desde esa carpeta, donde el candado no llega.

## Comprobar que quedó bien

1. Conectar la billetera y confirmar que la cabecera dice **Arbitrum Sepolia**.
2. Abrir `/junta/0` — es «Las Emprendedoras», la junta sembrada y ya completa.
3. Abrir `/auditar/0` y confirmar que **cuadra**: lo aportado menos lo distribuido tiene
   que coincidir con lo que el token dice que hay, que son dos fuentes independientes.
4. Abrir la consola del navegador. No debería haber ninguna llamada a
   `arb-sepolia.g.alchemy.com`; si aparece, `rpcOverrides` no llegó al paquete.

## Lo que no se despliega

Los contratos. Volver a correr `yarn deploy` los activa de nuevo en direcciones distintas
y deja huérfana la demostración sembrada, que costó ocho cuentas y varias horas de reloj
de la cadena. Si alguna vez hay que hacerlo, hay que volver a sembrar y actualizar
`docs/addresses.md` y `deployedContracts.ts` en el mismo movimiento.
