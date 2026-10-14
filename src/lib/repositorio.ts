/**
 * Camada de acesso a dados do contAI sobre o Supabase.
 *
 * Etapa 0 da integração: este módulo existe, é testado isoladamente e NÃO é
 * usado por nenhuma tela ainda. O aplicativo continua funcionando com
 * localStorage até a etapa 2.
 *
 * Princípios:
 *
 *  - **Cliente injetado.** `criarRepositorio(sb)` recebe o `SupabaseClient`
 *    pronto. Nada de ler variáveis de ambiente aqui — isso mantém o módulo
 *    testável fora do navegador e desacoplado de `supabase.ts`.
 *
 *  - **`user_id` num ponto só.** As telas nunca informam de quem é o dado; o
 *    repositório o obtém da sessão. O isolamento real, porém, é do banco:
 *    RLS mais chaves estrangeiras compostas. Esta camada é conveniência, não
 *    fronteira de segurança.
 *
 *  - **Ordem das escritas importa.** `contas` antes de `faturas`, e ambas
 *    antes de `movimentacoes`. Na exclusão, o inverso. As funções em lote
 *    respeitam isso; as individuais deixam a cargo de quem chama.
 *
 *  - **Erros normalizados.** Códigos do Postgres e falhas de rede viram
 *    `ErroRepositorio` com uma `categoria` estável, para a interface decidir
 *    o que dizer sem conhecer códigos SQL.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Conta, EstadoApp, Investimento, Mensagem, Meta, Recorrente, Usuario,
} from '@/types';
import {
  categoriaParaLinha, categoriasParaDominio, contaParaDominio, contaParaLinha,
  faturaParaDominio, faturaParaLinha, investimentoParaDominio, investimentoParaLinha,
  mensagemParaDominio, mensagemParaLinha, metaParaDominio, metaParaLinha,
  movimentacaoParaDominio, movimentacaoParaLinha, orcamentoParaDominio, orcamentoParaLinha,
  perfilParaDominio, perfilParaLinha, recorrenteParaDominio, recorrenteParaLinha,
  regraParaLinha, regrasParaDominio,
  type FaturaPersistida, type MovimentacaoPersistida, type OrcamentoPersistido,
  type RegraCategoria, type LinhaConta, type LinhaFatura, type LinhaInvestimento,
  type LinhaMensagem, type LinhaMeta, type LinhaMovimentacao, type LinhaOrcamento,
  type LinhaRecorrente, type LinhaPerfil,
} from './mapeamento.ts';

/* ------------------------------------------------------------------ *
 * Erros
 * ------------------------------------------------------------------ */

export type CategoriaErro =
  | 'rede'        // sem conexão, projeto pausado, tempo esgotado
  | 'sessao'      // sem sessão ou token expirado
  | 'permissao'   // RLS negou, ou privilégio de tabela ausente
  | 'duplicado'   // violação de restrição única
  | 'vinculo'     // violação de chave estrangeira
  | 'validacao'   // CHECK, tipo inválido, campo obrigatório
  | 'desconhecido';

export class ErroRepositorio extends Error {
  categoria: CategoriaErro;
  codigo: string | null;
  detalhe: string | null;
  constructor(categoria: CategoriaErro, mensagem: string, codigo?: string | null, detalhe?: string | null) {
    super(mensagem);
    this.name = 'ErroRepositorio';
    this.categoria = categoria;
    this.codigo = codigo ?? null;
    this.detalhe = detalhe ?? null;
  }
}

const MENSAGENS: Record<CategoriaErro, string> = {
  rede: 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.',
  sessao: 'Sua sessão expirou. Entre novamente para continuar.',
  permissao: 'Você não tem permissão para acessar esse registro.',
  duplicado: 'Já existe um registro com esses dados.',
  vinculo: 'Este registro está vinculado a outros e não pode ser alterado ou removido assim.',
  validacao: 'Algum dado informado não é válido.',
  desconhecido: 'Não foi possível concluir a operação.',
};

/** Traduz erro do PostgREST/Postgres/rede para uma categoria estável. */
export function normalizarErro(e: unknown): ErroRepositorio {
  if (e instanceof ErroRepositorio) return e;

  const err = e as { code?: string; message?: string; details?: string; hint?: string; status?: number };
  const codigo = err?.code ?? null;
  const msg = err?.message ?? '';

  let categoria: CategoriaErro = 'desconhecido';

  if (codigo === '23505') categoria = 'duplicado';
  else if (codigo === '23503') categoria = 'vinculo';
  else if (codigo === '23502' || codigo === '23514' || codigo === '22P02' || codigo === '22003') categoria = 'validacao';
  else if (codigo === '42501' || codigo === '42P01') categoria = 'permissao';
  else if (codigo === '401' || codigo === 'PGRST301' || err?.status === 401) categoria = 'sessao';
  else if (codigo === '403' || err?.status === 403) categoria = 'permissao';
  else if (/row-level security|violates row-level/i.test(msg)) categoria = 'permissao';
  else if (/JWT|token .*expired|session/i.test(msg)) categoria = 'sessao';
  else if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Failed to fetch|aborted/i.test(msg)) categoria = 'rede';
  else if (/invalid input syntax for type uuid/i.test(msg)) categoria = 'validacao';

  return new ErroRepositorio(
    categoria,
    MENSAGENS[categoria],
    codigo,
    [err?.details, err?.hint, msg].filter(Boolean).join(' | ') || null,
  );
}

/** Envolve uma chamada do Supabase, devolvendo os dados ou lançando normalizado. */
async function exec<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let r: { data: T | null; error: unknown };
  try {
    r = await p;
  } catch (e) {
    throw normalizarErro(e);            // falha de transporte, antes de haver resposta
  }
  if (r.error) throw normalizarErro(r.error);
  return (r.data ?? []) as T;
}

/* ------------------------------------------------------------------ *
 * Repositório
 * ------------------------------------------------------------------ */

/** Entidades em ordem segura de INSERÇÃO (pais antes de filhos). */
export const ORDEM_INSERCAO = [
  'contas', 'faturas', 'movimentacoes',
  'investimentos', 'metas', 'orcamentos', 'recorrentes',
  'categorias_custom', 'regras_categoria', 'mensagens',
] as const;

/** Ordem segura de EXCLUSÃO: o inverso. */
export const ORDEM_EXCLUSAO = [...ORDEM_INSERCAO].reverse();

export function criarRepositorio(sb: SupabaseClient) {
  /** Id do usuário autenticado. Lança 'sessao' se não houver sessão. */
  async function usuarioId(): Promise<string> {
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) {
      throw new ErroRepositorio('sessao', MENSAGENS.sessao, null, (error as Error | null)?.message ?? 'sem usuário');
    }
    return data.user.id;
  }

  /* ----------------------------- Perfil ----------------------------- */
  const perfil = {
    async obter(): Promise<Usuario | null> {
      const id = await usuarioId();
      const linhas = await exec<LinhaPerfil[]>(sb.from('perfis').select('*').eq('id', id).limit(1));
      return linhas[0] ? perfilParaDominio(linhas[0]) : null;
    },
    async atualizar(dados: Partial<Usuario>): Promise<Usuario> {
      const id = await usuarioId();
      const linhas = await exec<LinhaPerfil[]>(
        sb.from('perfis').update(perfilParaLinha(dados)).eq('id', id).select('*'),
      );
      if (!linhas[0]) throw new ErroRepositorio('permissao', MENSAGENS.permissao, null, 'perfil não encontrado');
      return perfilParaDominio(linhas[0]);
    },
    /** Recria o próprio perfil caso o gatilho de cadastro não o tenha criado. */
    async garantir(nome: string, email: string): Promise<Usuario> {
      const existente = await perfil.obter();
      if (existente) return existente;
      const id = await usuarioId();
      const linhas = await exec<LinhaPerfil[]>(
        sb.from('perfis').insert({ id, nome, email }).select('*'),
      );
      return perfilParaDominio(linhas[0]);
    },
  };

  /* --------------------- Fábrica genérica de CRUD -------------------- */
  function colecao<D, L extends { id: string }>(
    tabela: string,
    paraDominio: (l: L) => D,
    paraLinha: (d: D, userId: string) => L,
    ordem?: { coluna: string; crescente: boolean },
  ) {
    return {
      async listar(): Promise<D[]> {
        let q = sb.from(tabela).select('*');
        if (ordem) q = q.order(ordem.coluna, { ascending: ordem.crescente });
        const linhas = await exec(q);
        return (linhas as L[]).map(paraDominio);
      },
      async inserir(itens: D | D[]): Promise<D[]> {
        const id = await usuarioId();
        const lista = Array.isArray(itens) ? itens : [itens];
        if (!lista.length) return [];
        const linhas = await exec(
          sb.from(tabela).insert(lista.map((d) => paraLinha(d, id))).select('*'),
        );
        return (linhas as L[]).map(paraDominio);
      },
      async atualizar(item: D & { id: string }): Promise<D> {
        const uid = await usuarioId();
        const linhas = await exec(
          sb.from(tabela).update(paraLinha(item, uid)).eq('id', item.id).select('*'),
        );
        const l = (linhas as L[])[0];
        // Zero linhas = o RLS filtrou: o registro não é desta pessoa (ou não existe).
        if (!l) throw new ErroRepositorio('permissao', MENSAGENS.permissao, null, `${tabela}: nenhuma linha atualizada`);
        return paraDominio(l);
      },
      async excluir(id: string): Promise<void> {
        const linhas = await exec(sb.from(tabela).delete().eq('id', id).select('id'));
        if (!(linhas as unknown[]).length) {
          throw new ErroRepositorio('permissao', MENSAGENS.permissao, null, `${tabela}: nenhuma linha removida`);
        }
      },
    };
  }

  const contas = colecao<Conta, LinhaConta>('contas', contaParaDominio, contaParaLinha, { coluna: 'nome', crescente: true });
  const faturas = colecao<FaturaPersistida, LinhaFatura>('faturas', faturaParaDominio, faturaParaLinha, { coluna: 'vencimento', crescente: true });
  const movimentacoes = colecao<MovimentacaoPersistida, LinhaMovimentacao>('movimentacoes', movimentacaoParaDominio, movimentacaoParaLinha, { coluna: 'data', crescente: false });
  const investimentos = colecao<Investimento, LinhaInvestimento>('investimentos', investimentoParaDominio, investimentoParaLinha);
  const metas = colecao<Meta, LinhaMeta>('metas', metaParaDominio, metaParaLinha, { coluna: 'prazo', crescente: true });
  const orcamentos = colecao<OrcamentoPersistido, LinhaOrcamento>('orcamentos', orcamentoParaDominio, orcamentoParaLinha, { coluna: 'categoria', crescente: true });
  const recorrentes = colecao<Recorrente, LinhaRecorrente>('recorrentes', recorrenteParaDominio, recorrenteParaLinha, { coluna: 'dia_vencimento', crescente: true });
  const mensagens = colecao<Mensagem, LinhaMensagem>('mensagens', mensagemParaDominio, mensagemParaLinha, { coluna: 'criado_em', crescente: true });

  /* ------------------ Coleções com forma diferente ------------------ */
  const categorias = {
    async listar(): Promise<string[]> {
      const linhas = await exec(sb.from('categorias_custom').select('*').order('nome'));
      return categoriasParaDominio(linhas);
    },
    async adicionar(nome: string): Promise<void> {
      const id = await usuarioId();
      await exec(sb.from('categorias_custom').insert(categoriaParaLinha({ nome }, id)).select('id'));
    },
    async remover(nome: string): Promise<void> {
      await exec(sb.from('categorias_custom').delete().eq('nome', nome).select('id'));
    },
  };

  const regras = {
    async listar(): Promise<Record<string, string>> {
      const linhas = await exec(sb.from('regras_categoria').select('*'));
      return regrasParaDominio(linhas);
    },
    /** O índice único é sobre (user_id, lower(padrao)); regravar substitui. */
    async definir(r: RegraCategoria): Promise<void> {
      const id = await usuarioId();
      const linha = regraParaLinha(r, id);
      const existentes = await exec(
        sb.from('regras_categoria').select('id').eq('padrao', linha.padrao).limit(1),
      );
      const atual = (existentes as { id: string }[])[0];
      if (atual) {
        await exec(sb.from('regras_categoria').update({ categoria: linha.categoria }).eq('id', atual.id).select('id'));
      } else {
        await exec(sb.from('regras_categoria').insert(linha).select('id'));
      }
    },
  };

  /* ------------------------ Carga e limpeza ------------------------ */

  /** Lê tudo o que o aplicativo precisa, em paralelo. */
  async function carregarTudo(): Promise<Omit<EstadoApp, 'autenticado'>> {
    const [
      usuario, listaContas, listaFaturas, listaMovs, listaInv,
      listaMetas, listaOrc, listaRec, listaCat, mapaRegras, listaMsg,
    ] = await Promise.all([
      perfil.obter(), contas.listar(), faturas.listar(), movimentacoes.listar(),
      investimentos.listar(), metas.listar(), orcamentos.listar(), recorrentes.listar(),
      categorias.listar(), regras.listar(), mensagens.listar(),
    ]);

    return {
      usuario: usuario ?? { nome: '', email: '', consentimentoIA: false, ocultarValores: false },
      contas: listaContas,
      movimentacoes: listaMovs,
      faturas: listaFaturas,
      investimentos: listaInv,
      metas: listaMetas,
      orcamentos: listaOrc,
      recorrentes: listaRec,
      categoriasCustom: listaCat,
      regrasCategoria: mapaRegras,
      conversas: listaMsg,
    };
  }

  /**
   * Remove TODOS os registros do usuário autenticado, na ordem que as chaves
   * estrangeiras permitem. Usado por testes e, no futuro, pela exclusão de
   * dados em Configurações. Não apaga a conta de acesso nem o perfil.
   */
  async function limparTudo(): Promise<Record<string, number>> {
    const id = await usuarioId();
    const contagem: Record<string, number> = {};
    for (const tabela of ORDEM_EXCLUSAO) {
      const linhas = await exec(sb.from(tabela).delete().eq('user_id', id).select('id'));
      contagem[tabela] = (linhas as unknown[]).length;
    }
    return contagem;
  }

  return {
    usuarioId, perfil, contas, faturas, movimentacoes, investimentos,
    metas, orcamentos, recorrentes, categorias, regras, mensagens,
    carregarTudo, limparTudo,
  };
}

export type Repositorio = ReturnType<typeof criarRepositorio>;
