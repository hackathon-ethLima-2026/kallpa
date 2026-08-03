# Publicar el frontend

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

```bash
cd packages/nextjs
yarn vercel          # la primera vez pide iniciar sesión y crear el proyecto
```

Cuando pregunte por el directorio raíz, es `packages/nextjs` — es un monorepo y la
aplicación no está en la raíz.

Después, en el panel de Vercel, **Settings → Environment Variables**:

```
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID = <el identificador de reown>
```

Y volver a publicar para que la variable entre en el paquete:

```bash
yarn vercel --prod
```

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
