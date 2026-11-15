"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os dados da página a cada `segundos` enquanto houver vídeo em processamento. */
export function AutoAtualizar({ ativo, segundos = 5 }: { ativo: boolean; segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [ativo, segundos, router]);
  return null;
}
