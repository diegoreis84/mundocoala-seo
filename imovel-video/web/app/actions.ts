"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { conferirSenha, criarSessao, criarUsuario, encerrarSessao, exigirUsuario } from "@/lib/auth";
import { confirmarPagamento, criarVideoComCredito, DATA_DIR, db, novoId } from "@/lib/db";
import { criarCheckout, modoTeste } from "@/lib/mercadopago";
import { planoPorId, precoPlano } from "@/lib/planos";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const comErro = (rota: string, msg: string): never => redirect(`${rota}?erro=${encodeURIComponent(msg)}`);

/* ---------------- conta ---------------- */

export async function cadastrar(f: FormData) {
  const nome = str(f, "nome");
  const email = str(f, "email").toLowerCase();
  const senha = String(f.get("senha") ?? "");
  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) comErro("/cadastrar", "Informe nome e um e-mail válido.");
  if (senha.length < 8) comErro("/cadastrar", "A senha precisa ter pelo menos 8 caracteres.");
  if (db().prepare("SELECT 1 FROM usuarios WHERE email = ?").get(email)) comErro("/cadastrar", "Já existe uma conta com este e-mail.");
  const id = criarUsuario(nome, email, senha);
  await criarSessao(id);
  redirect("/painel");
}

export async function entrar(f: FormData) {
  const email = str(f, "email").toLowerCase();
  const senha = String(f.get("senha") ?? "");
  const u = db().prepare("SELECT id, senha_hash FROM usuarios WHERE email = ?").get(email) as { id: string; senha_hash: string } | undefined;
  if (!u || !conferirSenha(senha, u.senha_hash)) comErro("/entrar", "E-mail ou senha incorretos.");
  await criarSessao(u!.id);
  redirect("/painel");
}

export async function sair() {
  await encerrarSessao();
  redirect("/");
}

/* ---------------- compra ---------------- */

export async function comprar(f: FormData) {
  const u = await exigirUsuario();
  const plano = planoPorId(str(f, "plano"));
  if (!plano) comErro("/comprar", "Pacote inválido.");
  const valor = precoPlano(plano!);
  const pedidoId = novoId();
  db()
    .prepare("INSERT INTO pedidos (id, usuario_id, plano, creditos, valor_centavos) VALUES (?, ?, ?, ?, ?)")
    .run(pedidoId, u.id, plano!.id, plano!.creditos, valor);

  if (modoTeste()) redirect(`/pagamento/teste/${pedidoId}`);

  let url: string;
  try {
    const ck = await criarCheckout({
      pedidoId,
      titulo: `${plano!.creditos} ${plano!.creditos === 1 ? "vídeo" : "vídeos"} de imóvel`,
      valorCentavos: valor,
      email: u.email,
    });
    db().prepare("UPDATE pedidos SET mp_preferencia = ? WHERE id = ?").run(ck.preferenciaId, pedidoId);
    url = ck.url;
  } catch (e) {
    console.error(e);
    comErro("/comprar", "Não foi possível iniciar o pagamento. Tente novamente em instantes.");
  }
  redirect(url!);
}

/** Só existe no modo teste (sem credenciais do Mercado Pago, fora de produção). */
export async function simularPagamento(f: FormData) {
  if (!modoTeste()) throw new Error("Simulação desativada.");
  const u = await exigirUsuario();
  const pedidoId = str(f, "pedido");
  const p = db().prepare("SELECT valor_centavos FROM pedidos WHERE id = ? AND usuario_id = ?").get(pedidoId, u.id) as
    | { valor_centavos: number }
    | undefined;
  if (!p) comErro("/comprar", "Pedido não encontrado.");
  confirmarPagamento(pedidoId, `teste-${pedidoId}`, p!.valor_centavos);
  redirect("/painel?ok=creditos");
}

/* ---------------- vídeos ---------------- */

export async function gerarVideo(f: FormData) {
  const u = await exigirUsuario();
  const url = str(f, "url");
  let valido = false;
  try {
    valido = ["http:", "https:"].includes(new URL(url).protocol);
  } catch {}
  if (!valido) comErro("/painel", "Cole o link completo do anúncio (começando com https://).");
  const r = criarVideoComCredito(u.id, url);
  if (!r.ok) redirect("/comprar?sem=1");
  redirect(`/painel/videos/${r.id}`);
}

/* ---------------- marca ---------------- */

export async function salvarMarca(f: FormData) {
  const u = await exigirUsuario();
  const cor = str(f, "cor");
  let logo = u.marca_logo;
  const arquivo = f.get("logo");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) comErro("/painel/marca", "O logo deve ser PNG, JPG ou WEBP.");
    if (arquivo.size > 3 * 1024 * 1024) comErro("/painel/marca", "O logo deve ter até 3 MB.");
    const ext = arquivo.type === "image/png" ? ".png" : arquivo.type === "image/webp" ? ".webp" : ".jpg";
    logo = path.join("logos", `${u.id}${ext}`);
    await fs.mkdir(path.join(DATA_DIR, "logos"), { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, logo), Buffer.from(await arquivo.arrayBuffer()));
  }
  db()
    .prepare("UPDATE usuarios SET marca_nome = ?, marca_creci = ?, marca_contato = ?, marca_cor = ?, marca_logo = ? WHERE id = ?")
    .run(
      str(f, "nome") || null,
      str(f, "creci") || null,
      str(f, "contato") || null,
      /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : null,
      logo,
      u.id,
    );
  revalidatePath("/painel/marca");
  redirect("/painel/marca?ok=1");
}
