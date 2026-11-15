import type { NextConfig } from "next";

const config: NextConfig = {
  // Gera um servidor enxuto para o container (Cloud Run).
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Bibliotecas do Google carregam arquivos .proto em tempo de execução: não devem ser empacotadas.
  serverExternalPackages: ["@google-cloud/firestore", "@google-cloud/storage"],
  // Formulários de logo podem enviar imagens de alguns MB.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default config;
