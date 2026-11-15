import fs from "node:fs";
import path from "node:path";

/** Pasta de dados local (banco SQLite e arquivos no modo local). Funciona com cwd em web/ ou em imovel-video/. */
export function dataDir(): string {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  const cwd = process.cwd();
  return path.join(fs.existsSync(path.join(cwd, "app")) ? cwd : path.join(cwd, "web"), "data");
}
