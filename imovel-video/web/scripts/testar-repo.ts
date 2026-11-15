/**
 * Teste de contrato da camada de dados. Roda contra SQLite (padrão) ou Firestore:
 *   DATA_DIR=/tmp/x npx tsx web/scripts/testar-repo.ts
 *   BANCO=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GOOGLE_CLOUD_PROJECT=teste npx tsx web/scripts/testar-repo.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EmailEmUso, getRepo } from "../lib/repo/index";

async function main() {
  const repo = await getRepo();
  const email = `t-${randomUUID()}@exemplo.com`;
  let ok = 0;
  const passo = (n: string) => console.log(`  ✓ ${n}`, ++ok);

  const uid = await repo.criarUsuario({ nome: "Teste", email, senhaHash: "x:y" });
  await assert.rejects(repo.criarUsuario({ nome: "Outro", email, senhaHash: "x:y" }), EmailEmUso);
  assert.equal((await repo.credenciais(email))?.id, uid);
  passo("cadastro e e-mail único");

  const sid = randomUUID();
  await repo.criarSessao(sid, uid, new Date(Date.now() + 60_000).toISOString());
  assert.equal((await repo.usuarioDaSessao(sid))?.id, uid);
  await repo.criarSessao("expirada-" + sid, uid, new Date(Date.now() - 1000).toISOString());
  assert.equal(await repo.usuarioDaSessao("expirada-" + sid), null);
  await repo.apagarSessao(sid);
  assert.equal(await repo.usuarioDaSessao(sid), null);
  passo("sessões (válida, expirada, apagada)");

  assert.deepEqual(await repo.criarVideoComCredito(uid, "https://x"), { ok: false });
  passo("sem crédito não gera vídeo");

  const pid = randomUUID();
  await repo.criarPedido({ id: pid, usuario_id: uid, plano: "p10", creditos: 2, valor_centavos: 13600 });
  assert.equal(await repo.confirmarPagamento(pid, "pg1", 100), false, "valor menor não credita");
  assert.equal((await repo.usuario(uid))?.creditos, 0);
  assert.equal(await repo.confirmarPagamento(pid, "pg1", 13600), true);
  assert.equal(await repo.confirmarPagamento(pid, "pg1", 13600), false, "segunda confirmação não credita");
  assert.equal((await repo.usuario(uid))?.creditos, 2);
  assert.equal((await repo.pedidoDoUsuario(pid, uid))?.status, "pago");
  assert.equal(await repo.pedidoDoUsuario(pid, "outro"), null);
  passo("pagamento: valor conferido e idempotente");

  // Esvazia a fila de execuções anteriores do teste.
  while (await repo.reservarProximo());
  const v1 = await repo.criarVideoComCredito(uid, "https://a");
  await new Promise((r) => setTimeout(r, 5));
  const v2 = await repo.criarVideoComCredito(uid, "https://b");
  assert.ok(v1.ok && v2.ok);
  assert.deepEqual(await repo.criarVideoComCredito(uid, "https://c"), { ok: false });
  assert.equal((await repo.usuario(uid))?.creditos, 0);
  const lista = await repo.listarVideos(uid);
  assert.deepEqual(lista.map((v) => v.url), ["https://b", "https://a"]);
  passo("crédito gasto por vídeo; lista do mais novo ao mais antigo");

  const reservas = await Promise.all([repo.reservarProximo(), repo.reservarProximo(), repo.reservarProximo()]);
  const ids = reservas.filter(Boolean).map((v) => v!.id).sort();
  assert.deepEqual(ids, [v1.ok ? v1.id : "", v2.ok ? v2.id : ""].sort(), "cada vídeo reservado uma única vez");
  passo("fila segura com 3 processadores simultâneos");

  await repo.falharVideo(v1.ok ? v1.id : "", "link ruim");
  await repo.falharVideo(v1.ok ? v1.id : "", "link ruim");
  assert.equal((await repo.usuario(uid))?.creditos, 1, "estorno uma única vez");
  assert.equal((await repo.videoDoUsuario(v1.ok ? v1.id : "", uid))?.status, "erro");
  passo("falha devolve o crédito uma única vez");

  assert.equal(await repo.reenfileirarTravados(60), 0, "recente não volta");
  assert.ok((await repo.reenfileirarTravados(-1)) >= 1, "travado volta para a fila");
  assert.equal((await repo.videoDoUsuario(v2.ok ? v2.id : "", uid))?.status, "na_fila");
  await repo.atualizarVideo(v2.ok ? v2.id : "", { status: "pronto", resultado: "{}", etapa: null });
  assert.equal((await repo.videoDoUsuario(v2.ok ? v2.id : "", uid))?.status, "pronto");
  assert.equal(await repo.videoDoUsuario(v2.ok ? v2.id : "", "outro"), null);
  passo("travados voltam para a fila; vídeo só visível ao dono");

  await repo.salvarMarca(uid, { marca_nome: "Imob", marca_creci: "1", marca_contato: "2", marca_cor: "#ffffff", marca_logo: "logos/x.png" });
  assert.equal((await repo.usuario(uid))?.marca_logo, "logos/x.png");
  passo("marca");
  console.log(`OK (${process.env.BANCO ?? "sqlite"}): ${ok} verificações`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
