"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { salvarBuffer } from "@/lib/armazenamento";
import { conferirSenha, criarSessao, encerrarSessao, exigirUsuario, hashSenha } from "@/lib/auth";
import { dispararProcessador } from "@/lib/processador";
import { EmailEmUso, getRepo } from "@/lib/repo";
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
  let id: string;
  try {
    id = await (await getRepo()).criarUsuario({ nome, email, senhaHash: hashSenha(senha) });
  } catch (e) {
    if (e instanceof EmailEmUso) comErro("/cadastrar", "Já existe uma conta com este e-mail.");
    throw e;
  }
  await criarSessao(id!);
  redirect("/painel");
}

export async function entrar(f: FormData) {
  const email = str(f, "email").toLowerCase();
  const senha = String(f.get("senha") ?? "");
  const u = await (await getRepo()).credenciais(email);
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
  const pedidoId = randomUUID();
  const repo = await getRepo();
  await repo.criarPedido({ id: pedidoId, usuario_id: u.id, plano: plano!.id, creditos: plano!.creditos, valor_centavos: valor });

  if (modoTeste()) redirect(`/pagamento/teste/${pedidoId}`);

  let url: string;
  try {
    const ck = await criarCheckout({
      pedidoId,
      titulo: `${plano!.creditos} ${plano!.creditos === 1 ? "vídeo" : "vídeos"} de imóvel`,
      valorCentavos: valor,
      email: u.email,
    });
    await repo.definirPreferencia(pedidoId, ck.preferenciaId);
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
  const repo = await getRepo();
  const p = await repo.pedidoDoUsuario(pedidoId, u.id);
  if (!p) comErro("/comprar", "Pedido não encontrado.");
  await repo.confirmarPagamento(pedidoId, `teste-${pedidoId}`, p!.valor_centavos);
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
  const r = await (await getRepo()).criarVideoComCredito(u.id, url);
  if (!r.ok) redirect("/comprar?sem=1");
  await dispararProcessador();
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
    logo = `logos/${u.id}${ext}`;
    await salvarBuffer(logo, Buffer.from(await arquivo.arrayBuffer()), arquivo.type);
  }
  await (await getRepo()).salvarMarca(u.id, {
    marca_nome: str(f, "nome") || null,
    marca_creci: str(f, "creci") || null,
    marca_contato: str(f, "contato") || null,
    marca_cor: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : null,
    marca_logo: logo,
  });
  revalidatePath("/painel/marca");
  redirect("/painel/marca?ok=1");
}
