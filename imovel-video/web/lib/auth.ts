import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, novoId, type Usuario } from "./db";

const COOKIE = "sessao";
const DIAS = 30;

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function conferirSenha(senha: string, armazenado: string): boolean {
  const [saltHex, hashHex] = armazenado.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(senha, Buffer.from(saltHex, "hex"), 64);
  const esperado = Buffer.from(hashHex, "hex");
  return esperado.length === hash.length && timingSafeEqual(esperado, hash);
}

export async function criarSessao(usuarioId: string) {
  const id = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS * 864e5);
  db().prepare("INSERT INTO sessoes (id, usuario_id, expira_em) VALUES (?, ?, ?)").run(id, usuarioId, expira.toISOString());
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expira,
  });
}

export async function encerrarSessao() {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (id) db().prepare("DELETE FROM sessoes WHERE id = ?").run(id);
  c.delete(COOKIE);
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const u = db()
    .prepare(
      `SELECT u.id, u.email, u.nome, u.creditos, u.marca_nome, u.marca_creci, u.marca_contato, u.marca_cor, u.marca_logo
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = ? AND s.expira_em > ?`,
    )
    .get(id, new Date().toISOString()) as Usuario | undefined;
  return u ?? null;
}

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/entrar");
  return u;
}

export function criarUsuario(nome: string, email: string, senha: string): string {
  const id = novoId();
  db().prepare("INSERT INTO usuarios (id, email, nome, senha_hash) VALUES (?, ?, ?, ?)").run(id, email, nome, hashSenha(senha));
  return id;
}
