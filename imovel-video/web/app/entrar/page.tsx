import Link from "next/link";
import { Erro } from "@/components/Erro";
import { entrar } from "../actions";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <section>
      <div className="container narrow">
        <div className="card">
          <h2>Entrar</h2>
          <Erro msg={erro} />
          <form action={entrar}>
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <label htmlFor="senha">Senha</label>
            <input id="senha" name="senha" type="password" autoComplete="current-password" required />
            <button className="btn block" style={{ marginTop: 20 }} type="submit">Entrar</button>
          </form>
          <p className="small muted" style={{ marginTop: 16 }}>
            Ainda não tem conta? <Link href="/cadastrar">Criar conta</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
