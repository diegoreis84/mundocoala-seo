"use client";

import { useState } from "react";

export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 1800);
      }}
    >
      {ok ? "Copiado!" : rotulo}
    </button>
  );
}
