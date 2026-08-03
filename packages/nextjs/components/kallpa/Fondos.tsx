"use client";

/**
 * Conseguir dinero de prueba.
 *
 * Kallpa corre sobre una red de pruebas, así que el dinero que se mueve es un token de
 * juguete que cualquiera puede acuñar. Eso no es un descuido: es lo que permite que alguien
 * abra la aplicación por primera vez y llegue a pagar una cuota sin pedirle fondos a nadie.
 *
 * La interfaz lo dice con todas sus letras en vez de disimularlo. Alguien que prueba esto
 * tiene que entender que no está moviendo dinero real — y quien lo evalúa, que la facilidad
 * para conseguirlo es una decisión de la red de pruebas y no una propiedad del sistema.
 */

import { useState } from "react";
import { useAccount } from "wagmi";
import { mUSDC } from "~~/components/kallpa/cifras";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/** Lo que se entrega de una vez: alcanza para diez cuotas de una junta típica. */
const ENTREGA = 500_000_000n;

export const BotonConseguirFondos = ({ variante = "borde" }: { variante?: "solido" | "borde" }) => {
  const { address } = useAccount();
  const [trabajando, setTrabajando] = useState(false);
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "mock_usdc" });
  const { refetch: releerSaldo } = useScaffoldReadContract({
    contractName: "mock_usdc",
    functionName: "balanceOf",
    args: [address],
  });

  if (!address) return null;

  const conseguir = async () => {
    try {
      setTrabajando(true);
      await writeContractAsync({ functionName: "mint", args: [address, ENTREGA] });
      await releerSaldo();
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <button className={variante === "solido" ? "k-boton" : "k-boton-borde"} onClick={conseguir} disabled={trabajando}>
      {trabajando ? "Acuñando…" : `Conseguir ${mUSDC(ENTREGA)} mUSDC de prueba`}
    </button>
  );
};

/** Tu saldo del token de la demostración, con la salida para conseguir más. */
export const TuSaldo = ({ mostrarBoton = true }: { mostrarBoton?: boolean }) => {
  const { address } = useAccount();
  const { data: saldo } = useScaffoldReadContract({
    contractName: "mock_usdc",
    functionName: "balanceOf",
    args: [address],
  });

  if (!address) return null;

  return (
    <div className="k-tarjeta flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <p className="k-meta mb-1">TU SALDO</p>
        <p className="k-prueba text-2xl text-[--color-oro]">{mUSDC(saldo as bigint)} mUSDC</p>
        <p className="mt-2 max-w-md text-sm text-[--color-gris]">
          Es dinero de prueba de la red de Arbitrum Sepolia, no dinero real. Cualquiera puede acuñarlo, y por eso puedes
          probar la aplicación completa sin pedirle nada a nadie.
        </p>
      </div>
      {mostrarBoton && <BotonConseguirFondos />}
    </div>
  );
};
