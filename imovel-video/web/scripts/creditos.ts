/**
 * Dá (ou retira) créditos de uma conta. Fica registrado em "movimentos" (motivo "cortesia").
 *
 * No Cloud Shell, na pasta imovel-video/web:
 *   npm ci --omit=dev
 *   BANCO=firestore GOOGLE_CLOUD_PROJECT=projeto-app-videos-imob npx -y tsx scripts/creditos.ts email@exemplo.com 3
 *
 * Use um número negativo para retirar. Cada execução é um lançamento novo.
 */
import { randomUUID } from "node:crypto";
import { getRepo } from "../lib/repo/index";

async function main() {
  const [email, qtd, motivo = "cortesia"] = process.argv.slice(2);
  const delta = Number(qtd);
  if (!email || !Number.isInteger(delta) || delta === 0) {
    console.error("Uso: tsx scripts/creditos.ts <email> <quantidade> [motivo]");
    process.exit(1);
  }
  const repo = await getRepo();
  const cred = await repo.credenciais(email.trim().toLowerCase());
  if (!cred) {
    console.error(`Conta não encontrada: ${email}`);
    process.exit(1);
  }
  const ok = await repo.ajustarCreditos(cred.id, delta, motivo, `${new Date().toISOString()}-${randomUUID().slice(0, 8)}`);
  const u = await repo.usuario(cred.id);
  console.log(ok ? `OK. ${email} agora tem ${u?.creditos} crédito(s).` : `Não aplicado (saldo ficaria negativo). Saldo: ${u?.creditos}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
