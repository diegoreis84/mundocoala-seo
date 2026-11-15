import Link from "next/link";
import { Erro } from "@/components/Erro";
import { cadastrar } from "../actions";

export default async function Cadastrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <section>
      <div className="container narrow">
        <div className="card">
          <h2>Criar conta</h2>
          <Erro msg={erro} />
          <form action={cadastrar}>
            <label htmlFor="nome">Nome</label>
            <input id="nome" name="nome" type="text" autoComplete="name" required />
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <label htmlFor="senha">Senha (mínimo 8 caracteres)</label>
            <input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
            <button className="btn block" style={{ marginTop: 20 }} type="submit">Criar conta</button>
          </form>
          <p className="small muted" style={{ marginTop: 16 }}>
            Já tem conta? <Link href="/entrar">Entrar</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
