export type TipoMov = 'receita' | 'despesa';
export type Origem = 'manual' | 'importacao' | 'ia';
export type StatusFatura = 'pendente' | 'paga' | 'em_analise';

/**
 * Metadados comuns a todos os registros persistidos no IndexedDB.
 * `demo` marca registros da base de demonstração (fictícios), que podem ser
 * removidos de uma vez sem afetar os dados reais.
 */
export interface Registro {
  id: string;
  criadoEm?: string;        // ISO com hora
  modificadoEm?: string;    // ISO com hora
  demo?: boolean;
}

export interface Movimentacao extends Registro {
  tipo: TipoMov;
  descricao: string;
  valor: number;            // sempre positivo; o sinal vem do tipo
  data: string;             // ISO: yyyy-mm-dd
  categoria: string;
  contaId: string;
  origem: Origem;
  faturaId?: string;
  documentoId?: string;
  parcela?: { atual: number; total: number };
  observacao?: string;
  hash?: string;            // usado na detecção de duplicidade da importação
}

export interface Conta extends Registro {
  nome: string;
  tipo: 'corrente' | 'poupanca' | 'cartao' | 'carteira';
  saldoInicial: number;
  limite?: number;          // apenas cartão
  cor: string;
}

export interface Fatura extends Registro {
  contaId?: string;
  emissor: string;
  referencia: string;
  valor: number;
  vencimento: string;       // ISO
  status: StatusFatura;
  documentoId?: string;     // arquivo guardado no IndexedDB
  arquivoNome?: string;
  arquivoTipo?: string;
  paginas?: number;
  importada?: boolean;
  linhaDigitavel?: string;
  cor: string;
  sigla: string;
}

/** Metadados de um arquivo enviado. O conteúdo binário fica no store `arquivos`. */
export interface Documento extends Registro {
  nome: string;
  tipo: string;
  tamanho: number;
  sha256: string;           // detecção de documento já importado
  paginas: number;
  faturaId?: string;
  importadoEm?: string;
  transacoesImportadas?: number;
}

export type Modalidade =
  | 'Renda fixa' | 'Tesouro Direto' | 'CDB' | 'LCI/LCA'
  | 'Fundos' | 'Ações' | 'ETFs' | 'Outros';

export interface Investimento extends Registro {
  nome: string;
  modalidade: Modalidade;
  valorInvestido: number;
  rentabilidade: number;    // % acumulada informada pelo usuário
  atualizadoEm: string;     // ISO — data da última atualização informada
  ativo: boolean;
}

export interface Meta extends Registro {
  nome: string;
  alvo: number;
  atual: number;
  prazo: string;            // ISO
  cor: string;
}

/** O id de um orçamento é a própria categoria. */
export interface Orcamento extends Registro {
  categoria: string;
  limite: number;
}

export interface Recorrente extends Registro {
  descricao: string;
  valor: number;
  diaVencimento: number;
  tipo: TipoMov;
  categoria: string;
  ativo: boolean;
}

export interface Categoria extends Registro {
  nome: string;
  tipo: TipoMov;
}

/** Regra de classificação aprendida: descrições que contêm `padrao` vão para `categoria`. */
export interface RegraCategoria extends Registro {
  padrao: string;
  categoria: string;
  origem: 'revisao' | 'movimentacao' | 'assistente' | 'manual';
}

/** Histórico de correções feitas pelo usuário em classificações sugeridas. */
export interface Correcao extends Registro {
  descricao: string;
  de: string;
  para: string;
  em: string;
}

export interface TaxaObtida {
  valor: number;            // % ao ano
  fonte: string;
  data: string;             // data de referência do dado (ISO)
  obtidaEm: string;         // quando o contAI buscou (ISO com hora)
}

export interface Preferencias {
  /** Assistente pode consultar os registros financeiros locais. */
  consentimentoIA: boolean;
  /** Usuário autorizou enviar documentos/dados ao backend externo de IA. */
  consentimentoEnvioExterno: boolean;
  ocultarValores: boolean;
  avisoPrivacidadeVisto: boolean;
  taxas?: Partial<Record<'CDI' | 'SELIC' | 'IPCA', TaxaObtida>>;
}

/* ---------- Importação de documentos ---------- */

export type StatusRevisao = 'pendente' | 'aprovada' | 'duvida' | 'ignorada' | 'duplicada';

export interface TransacaoExtraida {
  id: string;
  data: string;
  descricao: string;
  descricaoOriginal: string;
  estabelecimento?: string;
  valor: number;
  tipo: TipoMov;
  natureza?: 'compra' | 'estorno' | 'pagamento' | 'transferencia' | 'receita' | 'tarifa' | 'outro';
  categoria: string;
  confianca: number;        // 0..1
  parcela?: { atual: number; total: number };
  status: StatusRevisao;
  motivoDuvida?: string;
  pagamentoFatura?: boolean; // pagamento total da fatura: não vira despesa
  linhaOrigem?: string;      // trecho do documento de onde a transação foi lida
}

export type MetodoLeitura = 'pdf-texto' | 'ocr-local' | 'servico-ia' | 'exemplo-demo' | 'manual';

export interface DocumentoAnalisado {
  id: string;
  arquivo?: File;
  arquivoNome: string;
  arquivoTipo: string;
  arquivoUrl?: string;
  sha256?: string;
  paginas: number;
  emissor?: string;
  documento: 'fatura_cartao' | 'conta_consumo' | 'extrato' | 'comprovante' | 'desconhecido';
  totalDocumento?: number;
  vencimento?: string;
  linhaDigitavel?: string;
  transacoes: TransacaoExtraida[];
  analisadoEm: string;
  metodo: MetodoLeitura;
  textoExtraido?: string;
  avisos: string[];
  jaImportadoEm?: string;   // mesmo arquivo (sha-256) já importado antes
  demo: boolean;            // true = documento de exemplo fictício
}

/* ---------- Assistente ---------- */

export interface Mensagem extends Registro {
  autor: 'user' | 'ia';
  texto: string;
  em: string;
  detalhe?: string;         // "de onde vem o número"
  sugestoes?: string[];
}

export interface PreferenciaAprendida {
  id: string;
  texto: string;
  em: string;
}

export interface ContextoConversa {
  intencao: string;
  periodo: string;
  categoria?: string;
  em: string;
}

export interface MemoriaAssistente {
  preferencias: PreferenciaAprendida[];
  contexto?: ContextoConversa;
}

/* ---------- Estado do aplicativo ---------- */

export interface EstadoApp {
  prefs: Preferencias;
  memoria: MemoriaAssistente;
  contas: Conta[];
  movimentacoes: Movimentacao[];
  faturas: Fatura[];
  documentos: Documento[];
  investimentos: Investimento[];
  metas: Meta[];
  orcamentos: Orcamento[];
  recorrentes: Recorrente[];
  categorias: Categoria[];
  regras: RegraCategoria[];
  correcoes: Correcao[];
  conversas: Mensagem[];
}

/** Coleções de registros (cada uma vira um object store no IndexedDB). */
export const COLECOES = [
  'contas', 'movimentacoes', 'faturas', 'documentos', 'investimentos', 'metas',
  'orcamentos', 'recorrentes', 'categorias', 'regras', 'correcoes', 'conversas',
] as const;
export type Colecao = (typeof COLECOES)[number];
