import type { Metadata } from "next";
import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { sair } from "./actions";
import "./globals.css";

export const metadata: Metadata = { title: SITE.nome, description: SITE.slogan };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioAtual();
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="header">
          <div className="container">
            <Link href="/" className="brand">
              Imóvel <span>em Vídeo</span>
            </Link>
            <nav className="nav">
              {u ? (
                <>
                  <Link href="/painel">Meus vídeos</Link>
                  <Link href="/painel/marca">Minha marca</Link>
                  <Link href="/comprar" className="pill">
                    {u.creditos} {u.creditos === 1 ? "crédito" : "créditos"}
                  </Link>
                  <form action={sair}>
                    <button className="btn ghost" type="submit">Sair</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/#precos">Preços</Link>
                  <Link href="/entrar">Entrar</Link>
                  <Link href="/cadastrar" className="btn">Criar conta</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="container">© {new Date().getFullYear()} {SITE.nome}. Pagamentos processados pelo Mercado Pago.</div>
        </footer>
      </body>
    </html>
  );
}
