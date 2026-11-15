import { Erro } from "@/components/Erro";
import { exigirUsuario } from "@/lib/auth";
import { salvarMarca } from "../../actions";

export default async function Marca({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario();
  const { erro, ok } = await searchParams;
  return (
    <section>
      <div className="container narrow">
        <div className="card">
          <h2>Minha marca</h2>
          <p className="muted small">Aparece nos seus vídeos: logo pequeno no canto e contato no final.</p>
          <Erro msg={erro} />
          {ok ? <div className="alert ok">Marca salva. Vale para os próximos vídeos.</div> : null}
          <form action={salvarMarca}>
            <label htmlFor="nome">Nome (imobiliária ou corretor)</label>
            <input id="nome" name="nome" type="text" defaultValue={u.marca_nome ?? u.nome} />
            <label htmlFor="creci">CRECI</label>
            <input id="creci" name="creci" type="text" defaultValue={u.marca_creci ?? ""} placeholder="Ex.: 12345-F" />
            <label htmlFor="contato">WhatsApp</label>
            <input id="contato" name="contato" type="tel" defaultValue={u.marca_contato ?? ""} placeholder="(11) 99999-0000" />
            <label htmlFor="cor">Cor de destaque</label>
            <input id="cor" name="cor" type="color" defaultValue={u.marca_cor ?? "#C8A46A"} style={{ width: 64, height: 40, border: 0, background: "none" }} />
            <label htmlFor="logo">Logo (PNG, JPG ou WEBP, até 3 MB)</label>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
            {u.marca_logo ? <p className="small muted">Logo atual salvo. Envie outro para trocar.</p> : null}
            <button className="btn block" style={{ marginTop: 20 }} type="submit">Salvar</button>
          </form>
        </div>
      </div>
    </section>
  );
}
