/**
 * Conversão entre o modelo do aplicativo (camelCase, em `src/types.ts`) e as
 * linhas do Postgres (snake_case, criadas pelas migrações em `supabase/`).
 *
 * Este módulo é puro: não importa o cliente Supabase nem lê variáveis de
 * ambiente. Só transforma objetos — o que o torna testável isoladamente.
 *
 * Decisões que valem registro:
 *
 *  - `Movimentacao.parcela` é um objeto no aplicativo e duas colunas no banco.
 *    A migração exige que ambas sejam nulas ou ambas preenchidas e coerentes.
 *
 *  - `Fatura.arquivoUrl` NÃO é persistido. No aplicativo ele é um object URL
 *    efêmero, que morre ao recarregar a página. O banco guarda `arquivo_caminho`
 *    (caminho no Storage privado), exposto aqui como `arquivoCaminho`.
 *
 *  - `Movimentacao.importacaoId` não existe no tipo do aplicativo hoje. A coluna
 *    `importacao_id` agrupa o lote de uma importação sem referenciar linha
 *    alguma — o aplicativo grava o id do documento analisado mesmo quando
 *    nenhuma fatura é criada. Fica como extensão opcional.
 *
 *  - Valores `numeric` chegam do PostgREST como número, mas são coagidos com
 *    `Number()` por garantia: um `numeric` muito grande seria serializado como
 *    string, e um NaN silencioso corromperia os cálculos financeiros.
 */
import type {
  Conta, Fatura, Investimento, Mensagem, Meta, Modalidade, Movimentacao,
  Orcamento, Origem, Recorrente, StatusFatura, TipoMov, Usuario,
} from '@/types';

/* ------------------------------------------------------------------ *
 * Extensões do modelo do aplicativo que só existem na persistência
 * ------------------------------------------------------------------ */

export type MovimentacaoPersistida = Movimentacao & { importacaoId?: string };
export type FaturaPersistida = Fatura & { arquivoCaminho?: string };
export type OrcamentoPersistido = Orcamento & { id?: string };
export type RegraCategoria = { id?: string; padrao: string; categoria: string };
export type CategoriaCustom = { id?: string; nome: string };

/* ------------------------------------------------------------------ *
 * Linhas do banco
 * ------------------------------------------------------------------ */

export interface LinhaPerfil {
  id: string;
  nome: string;
  email: string | null;
  consentimento_ia: boolean;
  ocultar_valores: boolean;
}

export interface LinhaConta {
  id: string;
  user_id: string;
  nome: string;
  tipo: Conta['tipo'];
  saldo_inicial: number;
  limite: number | null;
  cor: string;
  arquivada: boolean;
}

export interface LinhaFatura {
  id: string;
  user_id: string;
  conta_id: string | null;
  emissor: string;
  referencia: string;
  valor: number;
  vencimento: string;
  status: StatusFatura;
  arquivo_caminho: string | null;
  arquivo_nome: string | null;
  arquivo_tipo: string | null;
  paginas: number | null;
  importada: boolean;
  cor: string;
  sigla: string;
}

export interface LinhaMovimentacao {
  id: string;
  user_id: string;
  tipo: TipoMov;
  descricao: string;
  valor: number;
  data: string;
  categoria: string;
  conta_id: string;
  origem: Origem;
  fatura_id: string | null;
  importacao_id: string | null;
  parcela_atual: number | null;
  parcela_total: number | null;
  observacao: string | null;
  hash: string | null;
}

export interface LinhaInvestimento {
  id: string;
  user_id: string;
  nome: string;
  modalidade: Modalidade;
  valor_investido: number;
  rentabilidade: number;
  data_atualizacao: string;
  ativo: boolean;
}

export interface LinhaMeta {
  id: string;
  user_id: string;
  nome: string;
  alvo: number;
  atual: number;
  prazo: string;
  cor: string;
}

export interface LinhaOrcamento {
  id: string;
  user_id: string;
  categoria: string;
  limite: number;
}

export interface LinhaRecorrente {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  tipo: TipoMov;
  categoria: string;
  ativo: boolean;
}

export interface LinhaCategoriaCustom {
  id: string;
  user_id: string;
  nome: string;
}

export interface LinhaRegraCategoria {
  id: string;
  user_id: string;
  padrao: string;
  categoria: string;
}

export interface LinhaMensagem {
  id: string;
  user_id: string;
  autor: Mensagem['autor'];
  texto: string;
  detalhe: string | null;
  sugestoes: string[];
  criado_em: string;
}

/* ------------------------------------------------------------------ *
 * Identificadores
 * ------------------------------------------------------------------ */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ehUuid = (v: unknown): v is string => typeof v === 'string' && RE_UUID.test(v);

/**
 * Gera um UUID v4. Substitui o `uid()` de `format.ts`, que produz algo como
 * "m3k2j1abc123" — formato que o Postgres recusa em colunas `uuid`.
 * O id é gerado no cliente de propósito: assim a interface já conhece o
 * identificador definitivo antes de a gravação terminar.
 */
export function novoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Reserva para ambientes sem Web Crypto
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ------------------------------------------------------------------ *
 * Auxiliares
 * ------------------------------------------------------------------ */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Converte '' e undefined em null, como o banco espera. */
const ouNulo = <T>(v: T | undefined | null | ''): T | null =>
  v === undefined || v === null || v === '' ? null : v;

/* ------------------------------------------------------------------ *
 * Perfil / Usuário
 * ------------------------------------------------------------------ */

export const perfilParaDominio = (l: LinhaPerfil): Usuario => ({
  nome: l.nome ?? '',
  email: l.email ?? '',
  consentimentoIA: !!l.consentimento_ia,
  ocultarValores: !!l.ocultar_valores,
});

export const perfilParaLinha = (u: Partial<Usuario>): Partial<LinhaPerfil> => {
  const l: Partial<LinhaPerfil> = {};
  if (u.nome !== undefined) l.nome = u.nome;
  if (u.email !== undefined) l.email = ouNulo(u.email);
  if (u.consentimentoIA !== undefined) l.consentimento_ia = u.consentimentoIA;
  if (u.ocultarValores !== undefined) l.ocultar_valores = u.ocultarValores;
  return l;
};

/* ------------------------------------------------------------------ *
 * Conta
 * ------------------------------------------------------------------ */

export const contaParaDominio = (l: LinhaConta): Conta => ({
  id: l.id,
  nome: l.nome,
  tipo: l.tipo,
  saldoInicial: num(l.saldo_inicial),
  limite: l.limite === null ? undefined : num(l.limite),
  cor: l.cor,
});

export const contaParaLinha = (c: Conta, userId: string): LinhaConta => ({
  id: c.id,
  user_id: userId,
  nome: c.nome,
  tipo: c.tipo,
  saldo_inicial: num(c.saldoInicial),
  // A migração exige limite nulo quando o tipo não é cartão.
  limite: c.tipo === 'cartao' ? ouNulo(c.limite) : null,
  cor: c.cor,
  arquivada: false,
});

/* ------------------------------------------------------------------ *
 * Fatura
 * ------------------------------------------------------------------ */

export const faturaParaDominio = (l: LinhaFatura): FaturaPersistida => ({
  id: l.id,
  contaId: l.conta_id ?? undefined,
  emissor: l.emissor,
  referencia: l.referencia,
  valor: num(l.valor),
  vencimento: l.vencimento,
  status: l.status,
  arquivoCaminho: l.arquivo_caminho ?? undefined,
  arquivoNome: l.arquivo_nome ?? undefined,
  arquivoTipo: l.arquivo_tipo ?? undefined,
  paginas: l.paginas ?? undefined,
  importada: !!l.importada,
  cor: l.cor,
  sigla: l.sigla,
});

export const faturaParaLinha = (f: FaturaPersistida, userId: string): LinhaFatura => ({
  id: f.id,
  user_id: userId,
  conta_id: ouNulo(f.contaId),
  emissor: f.emissor,
  referencia: f.referencia ?? '',
  valor: num(f.valor),
  vencimento: f.vencimento,
  status: f.status,
  // arquivoUrl é efêmero e não é persistido — ver cabeçalho.
  arquivo_caminho: ouNulo(f.arquivoCaminho),
  arquivo_nome: ouNulo(f.arquivoNome),
  arquivo_tipo: ouNulo(f.arquivoTipo),
  paginas: ouNulo(f.paginas),
  importada: !!f.importada,
  cor: f.cor,
  sigla: (f.sigla ?? '').slice(0, 8),
});

/* ------------------------------------------------------------------ *
 * Movimentação
 * ------------------------------------------------------------------ */

export const movimentacaoParaDominio = (l: LinhaMovimentacao): MovimentacaoPersistida => ({
  id: l.id,
  tipo: l.tipo,
  descricao: l.descricao,
  valor: num(l.valor),
  data: l.data,
  categoria: l.categoria,
  contaId: l.conta_id,
  origem: l.origem,
  faturaId: l.fatura_id ?? undefined,
  importacaoId: l.importacao_id ?? undefined,
  parcela:
    l.parcela_atual !== null && l.parcela_total !== null
      ? { atual: l.parcela_atual, total: l.parcela_total }
      : undefined,
  observacao: l.observacao ?? undefined,
  hash: l.hash ?? undefined,
});

export const movimentacaoParaLinha = (m: MovimentacaoPersistida, userId: string): LinhaMovimentacao => ({
  id: m.id,
  user_id: userId,
  tipo: m.tipo,
  descricao: m.descricao,
  valor: num(m.valor),
  data: m.data,
  categoria: m.categoria,
  conta_id: m.contaId,
  origem: m.origem,
  fatura_id: ouNulo(m.faturaId),
  importacao_id: ouNulo(m.importacaoId),
  // Ou os dois campos, ou nenhum: a restrição do banco rejeita meio parcelamento.
  parcela_atual: m.parcela ? m.parcela.atual : null,
  parcela_total: m.parcela ? m.parcela.total : null,
  observacao: ouNulo(m.observacao),
  hash: ouNulo(m.hash),
});

/* ------------------------------------------------------------------ *
 * Investimento
 * ------------------------------------------------------------------ */

export const investimentoParaDominio = (l: LinhaInvestimento): Investimento => ({
  id: l.id,
  nome: l.nome,
  modalidade: l.modalidade,
  valorInvestido: num(l.valor_investido),
  rentabilidade: num(l.rentabilidade),
  atualizadoEm: l.data_atualizacao,
  ativo: !!l.ativo,
});

export const investimentoParaLinha = (i: Investimento, userId: string): LinhaInvestimento => ({
  id: i.id,
  user_id: userId,
  nome: i.nome,
  modalidade: i.modalidade,
  valor_investido: num(i.valorInvestido),
  rentabilidade: num(i.rentabilidade),
  // `atualizadoEm` é a data informada pelo usuário, não a auditoria da linha.
  data_atualizacao: i.atualizadoEm,
  ativo: !!i.ativo,
});

/* ------------------------------------------------------------------ *
 * Meta
 * ------------------------------------------------------------------ */

export const metaParaDominio = (l: LinhaMeta): Meta => ({
  id: l.id,
  nome: l.nome,
  alvo: num(l.alvo),
  atual: num(l.atual),
  prazo: l.prazo,
  cor: l.cor,
});

export const metaParaLinha = (m: Meta, userId: string): LinhaMeta => ({
  id: m.id,
  user_id: userId,
  nome: m.nome,
  alvo: num(m.alvo),
  atual: num(m.atual),
  prazo: m.prazo,
  cor: m.cor,
});

/* ------------------------------------------------------------------ *
 * Orçamento — no aplicativo a chave é a categoria; no banco há id próprio
 * ------------------------------------------------------------------ */

export const orcamentoParaDominio = (l: LinhaOrcamento): OrcamentoPersistido => ({
  id: l.id,
  categoria: l.categoria,
  limite: num(l.limite),
});

export const orcamentoParaLinha = (o: OrcamentoPersistido, userId: string): LinhaOrcamento => ({
  id: o.id ?? novoId(),
  user_id: userId,
  categoria: o.categoria,
  limite: num(o.limite),
});

/* ------------------------------------------------------------------ *
 * Recorrente
 * ------------------------------------------------------------------ */

export const recorrenteParaDominio = (l: LinhaRecorrente): Recorrente => ({
  id: l.id,
  descricao: l.descricao,
  valor: num(l.valor),
  diaVencimento: l.dia_vencimento,
  tipo: l.tipo,
  categoria: l.categoria,
  ativo: !!l.ativo,
});

export const recorrenteParaLinha = (r: Recorrente, userId: string): LinhaRecorrente => ({
  id: r.id,
  user_id: userId,
  descricao: r.descricao,
  valor: num(r.valor),
  dia_vencimento: r.diaVencimento,
  tipo: r.tipo,
  categoria: r.categoria,
  ativo: !!r.ativo,
});

/* ------------------------------------------------------------------ *
 * Categorias próprias e regras aprendidas
 * ------------------------------------------------------------------ */

export const categoriasParaDominio = (linhas: LinhaCategoriaCustom[]): string[] =>
  linhas.map((l) => l.nome);

export const categoriaParaLinha = (c: CategoriaCustom, userId: string): LinhaCategoriaCustom => ({
  id: c.id ?? novoId(),
  user_id: userId,
  nome: c.nome,
});

/** O aplicativo guarda as regras como objeto { padrão: categoria }. */
export const regrasParaDominio = (linhas: LinhaRegraCategoria[]): Record<string, string> =>
  Object.fromEntries(linhas.map((l) => [l.padrao.toLowerCase(), l.categoria]));

export const regraParaLinha = (r: RegraCategoria, userId: string): LinhaRegraCategoria => ({
  id: r.id ?? novoId(),
  user_id: userId,
  // O índice único do banco é sobre lower(padrao); normalizamos aqui também.
  padrao: r.padrao.toLowerCase(),
  categoria: r.categoria,
});

/* ------------------------------------------------------------------ *
 * Mensagem do assistente
 * ------------------------------------------------------------------ */

export const mensagemParaDominio = (l: LinhaMensagem): Mensagem => ({
  id: l.id,
  autor: l.autor,
  texto: l.texto,
  detalhe: l.detalhe ?? undefined,
  sugestoes: l.sugestoes?.length ? l.sugestoes : undefined,
  em: l.criado_em,
});

export const mensagemParaLinha = (m: Mensagem, userId: string): LinhaMensagem => ({
  id: m.id,
  user_id: userId,
  autor: m.autor,
  texto: m.texto,
  detalhe: ouNulo(m.detalhe),
  sugestoes: m.sugestoes ?? [],
  criado_em: m.em,
});
