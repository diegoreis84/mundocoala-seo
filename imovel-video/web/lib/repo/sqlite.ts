/** Implementação local (SQLite embutido no Node). Ideal para desenvolvimento e para um servidor único. */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../caminhos";
import { EmailEmUso, type Marca, type Pedido, type Repo, type Usuario, type Video } from "./tipos";

const g = globalThis as unknown as { __db?: DatabaseSync };
const agora = () => new Date().toISOString();
const COLS_USUARIO = "id, email, nome, creditos, marca_nome, marca_creci, marca_contato, marca_cor, marca_logo";

function db(): DatabaseSync {
  if (g.__db) return g.__db;
  fs.mkdirSync(dataDir(), { recursive: true });
  const d = new DatabaseSync(path.join(dataDir(), "app.db"));
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, senha_hash TEXT NOT NULL,
      creditos INTEGER NOT NULL DEFAULT 0 CHECK (creditos >= 0),
      marca_nome TEXT, marca_creci TEXT, marca_contato TEXT, marca_cor TEXT, marca_logo TEXT,
      criado_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, expira_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), plano TEXT NOT NULL,
      creditos INTEGER NOT NULL, valor_centavos INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente',
      mp_preferencia TEXT, mp_pagamento TEXT, criado_em TEXT NOT NULL, pago_em TEXT
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'na_fila', etapa TEXT, erro TEXT, titulo TEXT, resultado TEXT,
      criado_em TEXT NOT NULL, iniciado_em TEXT, concluido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS videos_usuario ON videos (usuario_id, criado_em);
    CREATE INDEX IF NOT EXISTS videos_fila ON videos (status, criado_em);
    CREATE TABLE IF NOT EXISTS movimentos (
      id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), delta INTEGER NOT NULL,
      motivo TEXT NOT NULL, ref TEXT NOT NULL, criado_em TEXT NOT NULL, UNIQUE (motivo, ref)
    );
  `);
  g.__db = d;
  return d;
}

function tx<T>(fn: (d: DatabaseSync) => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn(d);
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Movimento de créditos idempotente por (motivo, ref). Deve rodar dentro de tx. */
function lancar(d: DatabaseSync, usuarioId: string, delta: number, motivo: string, ref: string): boolean {
  if (d.prepare("SELECT 1 FROM movimentos WHERE motivo = ? AND ref = ?").get(motivo, ref)) return false;
  const r = d.prepare("UPDATE usuarios SET creditos = creditos + ? WHERE id = ? AND creditos + ? >= 0").run(delta, usuarioId, delta);
  if (r.changes === 0) return false;
  d.prepare("INSERT INTO movimentos (id, usuario_id, delta, motivo, ref, criado_em) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(), usuarioId, delta, motivo, ref, agora(),
  );
  return true;
}

export const sqliteRepo: Repo = {
  async criarUsuario({ nome, email, senhaHash }) {
    const id = randomUUID();
    try {
      db().prepare("INSERT INTO usuarios (id, email, nome, senha_hash, criado_em) VALUES (?, ?, ?, ?, ?)").run(id, email, nome, senhaHash, agora());
    } catch (e) {
      if (String(e).includes("UNIQUE")) throw new EmailEmUso();
      throw e;
    }
    return id;
  },
  async credenciais(email) {
    return (db().prepare("SELECT id, senha_hash FROM usuarios WHERE email = ?").get(email) as { id: string; senha_hash: string } | undefined) ?? null;
  },
  async usuario(id) {
    return (db().prepare(`SELECT ${COLS_USUARIO} FROM usuarios WHERE id = ?`).get(id) as Usuario | undefined) ?? null;
  },
  async salvarMarca(usuarioId, m: Marca) {
    db()
      .prepare("UPDATE usuarios SET marca_nome = ?, marca_creci = ?, marca_contato = ?, marca_cor = ?, marca_logo = ? WHERE id = ?")
      .run(m.marca_nome, m.marca_creci, m.marca_contato, m.marca_cor, m.marca_logo, usuarioId);
  },

  async criarSessao(id, usuarioId, expiraEm) {
    db().prepare("INSERT INTO sessoes (id, usuario_id, expira_em) VALUES (?, ?, ?)").run(id, usuarioId, expiraEm);
  },
  async usuarioDaSessao(id) {
    const cols = COLS_USUARIO.split(", ").map((c) => `u.${c}`).join(", ");
    return (
      (db()
        .prepare(`SELECT ${cols} FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ? AND s.expira_em > ?`)
        .get(id, agora()) as Usuario | undefined) ?? null
    );
  },
  async apagarSessao(id) {
    db().prepare("DELETE FROM sessoes WHERE id = ?").run(id);
  },

  async criarPedido(p) {
    db()
      .prepare("INSERT INTO pedidos (id, usuario_id, plano, creditos, valor_centavos, criado_em) VALUES (?, ?, ?, ?, ?, ?)")
      .run(p.id, p.usuario_id, p.plano, p.creditos, p.valor_centavos, agora());
  },
  async pedidoDoUsuario(id, usuarioId) {
    return (
      (db().prepare("SELECT id, usuario_id, plano, creditos, valor_centavos, status FROM pedidos WHERE id = ? AND usuario_id = ?").get(id, usuarioId) as
        | Pedido
        | undefined) ?? null
    );
  },
  async definirPreferencia(pedidoId, preferencia) {
    db().prepare("UPDATE pedidos SET mp_preferencia = ? WHERE id = ?").run(preferencia, pedidoId);
  },
  async confirmarPagamento(pedidoId, pagamentoId, valor) {
    return tx((d) => {
      const p = d.prepare("SELECT usuario_id, creditos, valor_centavos FROM pedidos WHERE id = ?").get(pedidoId) as
        | { usuario_id: string; creditos: number; valor_centavos: number }
        | undefined;
      if (!p || valor < p.valor_centavos) return false;
      const creditou = lancar(d, p.usuario_id, p.creditos, "compra", pedidoId);
      d.prepare("UPDATE pedidos SET status = 'pago', mp_pagamento = ?, pago_em = COALESCE(pago_em, ?) WHERE id = ?").run(pagamentoId, agora(), pedidoId);
      return creditou;
    });
  },

  async criarVideoComCredito(usuarioId, url) {
    try {
      return tx((d) => {
        const id = randomUUID();
        d.prepare("INSERT INTO videos (id, usuario_id, url, criado_em) VALUES (?, ?, ?, ?)").run(id, usuarioId, url, agora());
        if (!lancar(d, usuarioId, -1, "video", id)) throw new SemCredito(); // desfaz o INSERT
        return { ok: true as const, id };
      });
    } catch (e) {
      if (e instanceof SemCredito) return { ok: false as const };
      throw e;
    }
  },
  async videoDoUsuario(id, usuarioId) {
    return (db().prepare("SELECT * FROM videos WHERE id = ? AND usuario_id = ?").get(id, usuarioId) as Video | undefined) ?? null;
  },
  async listarVideos(usuarioId) {
    return db().prepare("SELECT * FROM videos WHERE usuario_id = ? ORDER BY criado_em DESC LIMIT 100").all(usuarioId) as Video[];
  },
  async reservarProximo() {
    return tx((d) => {
      const v = d.prepare("SELECT * FROM videos WHERE status = 'na_fila' ORDER BY criado_em LIMIT 1").get() as Video | undefined;
      if (!v) return null;
      const ini = agora();
      d.prepare("UPDATE videos SET status = 'processando', etapa = 'Iniciando', iniciado_em = ? WHERE id = ?").run(ini, v.id);
      return { ...v, status: "processando" as const, iniciado_em: ini };
    });
  },
  async atualizarVideo(id, campos) {
    const ks = Object.keys(campos) as (keyof typeof campos)[];
    if (!ks.length) return;
    db()
      .prepare(`UPDATE videos SET ${ks.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .run(...ks.map((k) => (campos[k] ?? null) as string | null), id);
  },
  async falharVideo(id, erro) {
    tx((d) => {
      const v = d.prepare("SELECT usuario_id FROM videos WHERE id = ?").get(id) as { usuario_id: string } | undefined;
      if (!v) return;
      d.prepare("UPDATE videos SET status = 'erro', etapa = NULL, erro = ?, concluido_em = ? WHERE id = ?").run(erro, agora(), id);
      lancar(d, v.usuario_id, 1, "estorno", id);
    });
  },
  async reenfileirarTravados(minutos) {
    const limite = new Date(Date.now() - minutos * 60_000).toISOString();
    return Number(
      db().prepare("UPDATE videos SET status = 'na_fila', etapa = NULL WHERE status = 'processando' AND (iniciado_em IS NULL OR iniciado_em < ?)").run(limite).changes,
    );
  },
};

class SemCredito extends Error {}
