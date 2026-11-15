import type { NextConfig } from "next";

const config: NextConfig = {
  // Formulários de logo podem enviar imagens de alguns MB.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default config;
