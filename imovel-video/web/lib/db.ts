/**
 * Banco de dados (SQLite embutido no Node). Usado pelo site e pelo processador de vídeos.
 * Para produção com mais de um servidor, trocar por Postgres mantendo estas funções.
 */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(__dirname_safe(), "data"));

function __dirname_safe() {
  // Funciona tanto no Next (cwd = web/) quanto no worker (cwd = imovel-video/).
  const cwd = process.cwd();
  return fs.existsSync(path.join(cwd, "app")) ? cwd : path.join(cwd, "web");
}

const g = globalThis as unknown as { __db?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__db) return g.__db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      creditos INTEGER NOT NULL DEFAULT 0 CHECK (creditos >= 0),
      marca_nome TEXT, marca_creci TEXT, marca_contato TEXT, marca_cor TEXT, marca_logo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira_em TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      plano TEXT NOT NULL,
      creditos INTEGER NOT NULL,
      valor_centavos INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      mp_preferencia TEXT,
      mp_pagamento TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      pago_em TEXT
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'na_fila',
      etapa TEXT,
      erro TEXT,
      titulo TEXT,
      resultado TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      concluido_em TEXT
    );
    CREATE TABLE IF NOT EXISTS movimentos (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      delta INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      ref TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (motivo, ref)
    );
  `);
  g.__db = d;
  return d;
}

export const novoId = () => randomUUID();

/** Executa em transação (BEGIN IMMEDIATE evita corrida entre site e processador). */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export type Usuario = {
  id: string;
  email: string;
  nome: string;
  creditos: number;
  marca_nome: string | null;
  marca_creci: string | null;
  marca_contato: string | null;
  marca_cor: string | null;
  marca_logo: string | null;
};

export type Video = {
  id: string;
  usuario_id: string;
  url: string;
  status: "na_fila" | "processando" | "pronto" | "erro";
  etapa: string | null;
  erro: string | null;
  titulo: string | null;
  resultado: string | null;
  criado_em: string;
  concluido_em: string | null;
};

/* ---------------- créditos ---------------- */

/**
 * Lança um movimento de créditos de forma idempotente: o mesmo (motivo, ref)
 * nunca é aplicado duas vezes (ex.: webhook de pagamento repetido).
 */
export function lancarCreditos(usuarioId: string, delta: number, motivo: string, ref: string): boolean {
  return tx(() => {
    const d = db();
    const ja = d.prepare("SELECT 1 FROM movimentos WHERE motivo = ? AND ref = ?").get(motivo, ref);
    if (ja) return false;
    const r = d.prepare("UPDATE usuarios SET creditos = creditos + ? WHERE id = ? AND creditos + ? >= 0").run(delta, usuarioId, delta);
    if (r.changes === 0) return false;
    d.prepare("INSERT INTO movimentos (id, usuario_id, delta, motivo, ref) VALUES (?, ?, ?, ?, ?)").run(novoId(), usuarioId, delta, motivo, ref);
    return true;
  });
}

/** Gasta 1 crédito e cria o vídeo na fila, atomicamente. */
export function criarVideoComCredito(usuarioId: string, url: string): { ok: true; id: string } | { ok: false; motivo: string } {
  return tx(() => {
    const d = db();
    const r = d.prepare("UPDATE usuarios SET creditos = creditos - 1 WHERE id = ? AND creditos > 0").run(usuarioId);
    if (r.changes === 0) return { ok: false as const, motivo: "sem_creditos" };
    const id = novoId();
    d.prepare("INSERT INTO videos (id, usuario_id, url) VALUES (?, ?, ?)").run(id, usuarioId, url);
    d.prepare("INSERT INTO movimentos (id, usuario_id, delta, motivo, ref) VALUES (?, ?, -1, 'video', ?)").run(novoId(), usuarioId, id);
    return { ok: true as const, id };
  });
}

/** Devolve o crédito de um vídeo que falhou (idempotente). */
export function estornarVideo(videoId: string) {
  const v = db().prepare("SELECT usuario_id FROM videos WHERE id = ?").get(videoId) as { usuario_id: string } | undefined;
  if (v) lancarCreditos(v.usuario_id, 1, "estorno", videoId);
}

/* ---------------- pedidos ---------------- */

/** Marca o pedido como pago e credita (idempotente). Confere o valor pago. */
export function confirmarPagamento(pedidoId: string, pagamentoId: string, valorPagoCentavos: number): boolean {
  const d = db();
  const p = d.prepare("SELECT * FROM pedidos WHERE id = ?").get(pedidoId) as
    | { id: string; usuario_id: string; creditos: number; valor_centavos: number; status: string }
    | undefined;
  if (!p) return false;
  if (valorPagoCentavos < p.valor_centavos) return false;
  const creditou = lancarCreditos(p.usuario_id, p.creditos, "compra", pedidoId);
  d.prepare("UPDATE pedidos SET status = 'pago', mp_pagamento = ?, pago_em = COALESCE(pago_em, datetime('now')) WHERE id = ?").run(pagamentoId, pedidoId);
  return creditou;
}
