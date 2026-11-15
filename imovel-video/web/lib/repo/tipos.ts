/** Contrato de acesso a dados. Duas implementações: SQLite (local) e Firestore (Google Cloud). */

export type Usuario = {
  id: string;
  email: string;
  nome: string;
  creditos: number;
  marca_nome: string | null;
  marca_creci: string | null;
  marca_contato: string | null;
  marca_cor: string | null;
  /** Chave do arquivo no armazenamento (ex.: logos/<id>.png). */
  marca_logo: string | null;
};

export type Pedido = {
  id: string;
  usuario_id: string;
  plano: string;
  creditos: number;
  valor_centavos: number;
  status: "pendente" | "pago";
};

export type StatusVideo = "na_fila" | "processando" | "pronto" | "erro";

export type Video = {
  id: string;
  usuario_id: string;
  url: string;
  status: StatusVideo;
  etapa: string | null;
  erro: string | null;
  titulo: string | null;
  resultado: string | null;
  criado_em: string; // ISO
  iniciado_em: string | null;
  concluido_em: string | null;
};

export type Marca = Pick<Usuario, "marca_nome" | "marca_creci" | "marca_contato" | "marca_cor" | "marca_logo">;

export class EmailEmUso extends Error {}

export interface Repo {
  criarUsuario(u: { nome: string; email: string; senhaHash: string }): Promise<string>;
  credenciais(email: string): Promise<{ id: string; senha_hash: string } | null>;
  usuario(id: string): Promise<Usuario | null>;
  salvarMarca(usuarioId: string, marca: Marca): Promise<void>;

  criarSessao(id: string, usuarioId: string, expiraEm: string): Promise<void>;
  usuarioDaSessao(id: string): Promise<Usuario | null>;
  apagarSessao(id: string): Promise<void>;

  criarPedido(p: Omit<Pedido, "status">): Promise<void>;
  pedidoDoUsuario(id: string, usuarioId: string): Promise<Pedido | null>;
  definirPreferencia(pedidoId: string, preferencia: string): Promise<void>;
  /** Marca pago e credita, de forma atômica e idempotente. Confere o valor. */
  confirmarPagamento(pedidoId: string, pagamentoId: string, valorPagoCentavos: number): Promise<boolean>;

  /** Gasta 1 crédito e põe o vídeo na fila, atomicamente. */
  criarVideoComCredito(usuarioId: string, url: string): Promise<{ ok: true; id: string } | { ok: false }>;
  videoDoUsuario(id: string, usuarioId: string): Promise<Video | null>;
  listarVideos(usuarioId: string): Promise<Video[]>;
  /** Reserva o vídeo mais antigo da fila (atômico entre vários processadores). */
  reservarProximo(): Promise<Video | null>;
  atualizarVideo(id: string, campos: Partial<Pick<Video, "etapa" | "titulo" | "status" | "resultado" | "concluido_em">>): Promise<void>;
  /** Marca erro e devolve o crédito (idempotente). */
  falharVideo(id: string, erro: string): Promise<void>;
  /** Devolve à fila vídeos "processando" há mais de `minutos` (processador caiu). */
  reenfileirarTravados(minutos: number): Promise<number>;
}
