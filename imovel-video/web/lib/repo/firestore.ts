/**
 * Implementação no Google Cloud Firestore (modo nativo).
 *
 * Coleções:
 *   usuarios/{id}            dados + saldo de créditos
 *   emails/{email}           { usuarioId } — garante e-mail único
 *   sessoes/{id}             { usuarioId, expiraEm }
 *   pedidos/{id}
 *   videos/{id}
 *   movimentos/{motivo:ref}  o id do documento torna cada lançamento idempotente
 *
 * Índices compostos necessários (criados pelo deploy.sh):
 *   videos: usuario_id ASC, criado_em DESC
 *   videos: status ASC, criado_em ASC
 */
import { randomUUID } from "node:crypto";
import { Firestore, type Transaction } from "@google-cloud/firestore";
import { EmailEmUso, type Marca, type Pedido, type Repo, type Usuario, type Video } from "./tipos";

const g = globalThis as unknown as { __fs?: Firestore };
function fs(): Firestore {
  g.__fs ??= new Firestore({ ignoreUndefinedProperties: true, databaseId: process.env.FIRESTORE_DATABASE || "(default)" });
  return g.__fs;
}
const agora = () => new Date().toISOString();
const col = (n: string) => fs().collection(n);

function paraUsuario(id: string, d: FirebaseData): Usuario {
  return {
    id,
    email: d.email,
    nome: d.nome,
    creditos: d.creditos ?? 0,
    marca_nome: d.marca_nome ?? null,
    marca_creci: d.marca_creci ?? null,
    marca_contato: d.marca_contato ?? null,
    marca_cor: d.marca_cor ?? null,
    marca_logo: d.marca_logo ?? null,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirebaseData = any;

function paraVideo(id: string, d: FirebaseData): Video {
  return {
    id,
    usuario_id: d.usuario_id,
    url: d.url,
    status: d.status,
    etapa: d.etapa ?? null,
    erro: d.erro ?? null,
    titulo: d.titulo ?? null,
    resultado: d.resultado ?? null,
    criado_em: d.criado_em,
    iniciado_em: d.iniciado_em ?? null,
    concluido_em: d.concluido_em ?? null,
  };
}

/**
 * Lança créditos dentro de uma transação, idempotente por (motivo, ref).
 * Firestore exige todas as leituras antes das escritas: por isso recebe os snapshots já lidos.
 */
async function lerParaLancamento(t: Transaction, usuarioId: string, motivo: string, ref: string) {
  const movRef = col("movimentos").doc(`${motivo}:${ref}`);
  const uRef = col("usuarios").doc(usuarioId);
  const [mov, u] = await Promise.all([t.get(movRef), t.get(uRef)]);
  return { movRef, uRef, jaLancado: mov.exists, saldo: (u.data()?.creditos as number | undefined) ?? null };
}
function escreverLancamento(
  t: Transaction,
  l: Awaited<ReturnType<typeof lerParaLancamento>>,
  usuarioId: string,
  delta: number,
  motivo: string,
  ref: string,
): boolean {
  if (l.jaLancado || l.saldo === null || l.saldo + delta < 0) return false;
  t.update(l.uRef, { creditos: l.saldo + delta });
  t.create(l.movRef, { usuario_id: usuarioId, delta, motivo, ref, criado_em: agora() });
  return true;
}

export const firestoreRepo: Repo = {
  async criarUsuario({ nome, email, senhaHash }) {
    const id = randomUUID();
    await fs().runTransaction(async (t) => {
      const eRef = col("emails").doc(encodeURIComponent(email));
      if ((await t.get(eRef)).exists) throw new EmailEmUso();
      t.create(eRef, { usuarioId: id });
      t.create(col("usuarios").doc(id), { email, nome, senha_hash: senhaHash, creditos: 0, criado_em: agora() });
    });
    return id;
  },
  async credenciais(email) {
    const e = await col("emails").doc(encodeURIComponent(email)).get();
    if (!e.exists) return null;
    const id = e.data()!.usuarioId as string;
    const u = await col("usuarios").doc(id).get();
    return u.exists ? { id, senha_hash: u.data()!.senha_hash as string } : null;
  },
  async usuario(id) {
    const u = await col("usuarios").doc(id).get();
    return u.exists ? paraUsuario(u.id, u.data()) : null;
  },
  async salvarMarca(usuarioId, m: Marca) {
    await col("usuarios").doc(usuarioId).update({ ...m });
  },

  async criarSessao(id, usuarioId, expiraEm) {
    await col("sessoes").doc(id).set({ usuarioId, expiraEm });
  },
  async usuarioDaSessao(id) {
    const s = await col("sessoes").doc(id).get();
    if (!s.exists || (s.data()!.expiraEm as string) <= agora()) return null;
    return this.usuario(s.data()!.usuarioId as string);
  },
  async apagarSessao(id) {
    await col("sessoes").doc(id).delete();
  },

  async criarPedido(p) {
    await col("pedidos").doc(p.id).create({ ...p, status: "pendente", criado_em: agora() });
  },
  async pedidoDoUsuario(id, usuarioId) {
    const p = await col("pedidos").doc(id).get();
    if (!p.exists || p.data()!.usuario_id !== usuarioId) return null;
    const d = p.data()!;
    return { id, usuario_id: d.usuario_id, plano: d.plano, creditos: d.creditos, valor_centavos: d.valor_centavos, status: d.status } as Pedido;
  },
  async definirPreferencia(pedidoId, preferencia) {
    await col("pedidos").doc(pedidoId).update({ mp_preferencia: preferencia });
  },
  async confirmarPagamento(pedidoId, pagamentoId, valor) {
    return fs().runTransaction(async (t) => {
      const pRef = col("pedidos").doc(pedidoId);
      const p = await t.get(pRef);
      if (!p.exists) return false;
      const d = p.data()!;
      if (valor < d.valor_centavos) return false;
      const l = await lerParaLancamento(t, d.usuario_id, "compra", pedidoId);
      const creditou = escreverLancamento(t, l, d.usuario_id, d.creditos, "compra", pedidoId);
      t.update(pRef, { status: "pago", mp_pagamento: pagamentoId, pago_em: d.pago_em ?? agora() });
      return creditou;
    });
  },

  async criarVideoComCredito(usuarioId, url) {
    const id = randomUUID();
    const ok = await fs().runTransaction(async (t) => {
      const l = await lerParaLancamento(t, usuarioId, "video", id);
      if (!escreverLancamento(t, l, usuarioId, -1, "video", id)) return false;
      t.create(col("videos").doc(id), { usuario_id: usuarioId, url, status: "na_fila", criado_em: agora() });
      return true;
    });
    return ok ? { ok: true as const, id } : { ok: false as const };
  },
  async videoDoUsuario(id, usuarioId) {
    const v = await col("videos").doc(id).get();
    if (!v.exists || v.data()!.usuario_id !== usuarioId) return null;
    return paraVideo(v.id, v.data());
  },
  async listarVideos(usuarioId) {
    const q = await col("videos").where("usuario_id", "==", usuarioId).orderBy("criado_em", "desc").limit(100).get();
    return q.docs.map((d) => paraVideo(d.id, d.data()));
  },
  async reservarProximo() {
    return fs().runTransaction(async (t) => {
      const q = await t.get(col("videos").where("status", "==", "na_fila").orderBy("criado_em", "asc").limit(1));
      const doc = q.docs[0];
      if (!doc) return null;
      const ini = agora();
      t.update(doc.ref, { status: "processando", etapa: "Iniciando", iniciado_em: ini });
      return { ...paraVideo(doc.id, doc.data()), status: "processando" as const, iniciado_em: ini };
    });
  },
  async atualizarVideo(id, campos) {
    if (Object.keys(campos).length) await col("videos").doc(id).update(campos);
  },
  async falharVideo(id, erro) {
    await fs().runTransaction(async (t) => {
      const vRef = col("videos").doc(id);
      const v = await t.get(vRef);
      if (!v.exists) return;
      const uid = v.data()!.usuario_id as string;
      const l = await lerParaLancamento(t, uid, "estorno", id);
      escreverLancamento(t, l, uid, 1, "estorno", id);
      t.update(vRef, { status: "erro", etapa: null, erro, concluido_em: agora() });
    });
  },
  async reenfileirarTravados(minutos) {
    const limite = new Date(Date.now() - minutos * 60_000).toISOString();
    const q = await col("videos").where("status", "==", "processando").get();
    let n = 0;
    for (const d of q.docs) {
      const ini = d.data().iniciado_em as string | undefined;
      if (!ini || ini < limite) {
        await d.ref.update({ status: "na_fila", etapa: null });
        n++;
      }
    }
    return n;
  },
};
