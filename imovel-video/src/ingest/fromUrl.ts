/**
 * Lê um anúncio a partir do link: baixa a página, encontra as fotos da galeria e extrai o texto.
 *
 * Heurística das fotos: anúncios guardam a galeria numa mesma pasta no servidor de imagens
 * (ex.: .../Imoveis/63184/). Agrupamos as URLs de imagem por pasta e ficamos com o maior grupo,
 * o que exclui logos, ícones e fotos de "imóveis similares".
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IGNORAR = /(logo|icon|favicon|sprite|avatar|banner|placeholder|loading|whatsapp-icon|selo|badge|flag|maps?\.(google|gstatic))/i;
const MIN_LADO = 400;
const MAX_FOTOS = 40;

export class LinkIlegivel extends Error {}

export type AnuncioLido = { url: string; texto: string; fotos: string[]; titulo: string };

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function textoDaPagina(html: string): string {
  const semScripts = html.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const comQuebras = semScripts.replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section)[^>]*>/gi, "\n");
  const linhas = decode(comQuebras.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);
  return linhas.join("\n").slice(0, 20000);
}

export function urlsDeImagens(html: string, base: string): string[] {
  const achados = new Set<string>();
  const limpo = html.replace(/\\\//g, "/");
  const re = /(https?:)?\/\/[^\s"'()<>]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'()<>]*)?/gi;
  for (const m of limpo.matchAll(re)) achados.add(m[0].startsWith("//") ? "https:" + m[0] : m[0]);
  for (const m of limpo.matchAll(/(?:src|data-src|href)=["']([^"']+?\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) {
    try {
      achados.add(new URL(m[1], base).toString());
    } catch {}
  }
  // Remove duplicadas que só mudam a query string.
  const porCaminho = new Map<string, string>();
  for (const u of achados) {
    if (IGNORAR.test(u)) continue;
    const k = u.split("?")[0];
    if (!porCaminho.has(k)) porCaminho.set(k, u);
  }
  const urls = [...porCaminho.values()];
  // Maior grupo por pasta = galeria do anúncio.
  const grupos = new Map<string, string[]>();
  for (const u of urls) {
    const pasta = u.split("?")[0].replace(/\/[^/]*$/, "");
    grupos.set(pasta, [...(grupos.get(pasta) ?? []), u]);
  }
  const maior = [...grupos.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  return (maior.length >= 4 ? maior : urls).slice(0, MAX_FOTOS);
}

async function baixar(url: string, destino: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Referer: url } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (Math.min(meta.width ?? 0, meta.height ?? 0) < MIN_LADO * 0.55) return false; // ícones/miniaturas
    await fs.writeFile(destino, buf);
    return true;
  } catch {
    return false;
  }
}

export async function lerAnuncio(url: string, pastaFotos: string): Promise<AnuncioLido> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", Accept: "text/html" } });
  } catch {
    throw new LinkIlegivel("Não conseguimos acessar este link. Confira se ele abre no navegador.");
  }
  const html = await res.text();
  if (res.status === 403 || /Attention Required|cf-browser-verification|captcha/i.test(html.slice(0, 5000))) {
    throw new LinkIlegivel(
      "Este site bloqueia a leitura automática (comum em portais como ZAP, VivaReal e OLX). Use o link do anúncio no site da imobiliária.",
    );
  }
  if (!res.ok) throw new LinkIlegivel(`O site respondeu com erro ${res.status}.`);

  const titulo = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const texto = textoDaPagina(html);
  const imagens = urlsDeImagens(html, res.url || url);

  await fs.mkdir(pastaFotos, { recursive: true });
  const fotos: string[] = [];
  const vistos = new Set<string>();
  // Baixa em lotes de 6.
  for (let i = 0; i < imagens.length; i += 6) {
    const lote = imagens.slice(i, i + 6);
    const res2 = await Promise.all(
      lote.map(async (u, j) => {
        const nome = `foto-${String(i + j + 1).padStart(2, "0")}${path.extname(u.split("?")[0]).toLowerCase() || ".jpg"}`;
        const destino = path.join(pastaFotos, nome);
        return (await baixar(u, destino)) ? destino : null;
      }),
    );
    for (const f of res2) {
      if (!f) continue;
      const h = crypto.createHash("sha1").update(await fs.readFile(f)).digest("hex");
      if (vistos.has(h)) await fs.rm(f);
      else {
        vistos.add(h);
        fotos.push(f);
      }
    }
  }
  if (fotos.length < 3) {
    throw new LinkIlegivel("Encontramos poucas fotos neste anúncio (mínimo 3). Confira se o link é da página do imóvel.");
  }
  return { url, texto, fotos, titulo };
}
