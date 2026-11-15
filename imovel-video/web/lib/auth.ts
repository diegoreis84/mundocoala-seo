import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo, type Usuario } from "./repo";

const COOKIE = "sessao";
const DIAS = 30;

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(senha, salt, 64).toString("hex")}`;
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
  await (await getRepo()).criarSessao(id, usuarioId, expira.toISOString());
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.SITE_URL?.startsWith("http://"),
    path: "/",
    expires: expira,
  });
}

export async function encerrarSessao() {
  const c = await cookies();
  const id = c.get(COOKIE)?.value;
  if (id) await (await getRepo()).apagarSessao(id);
  c.delete(COOKIE);
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  return (await getRepo()).usuarioDaSessao(id);
}

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/entrar");
  return u;
}
