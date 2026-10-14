export type TipoMov = 'receita' | 'despesa';
export type Origem = 'manual' | 'importacao' | 'ia';
export type StatusFatura = 'pendente' | 'paga' | 'em_analise';

export interface Movimentacao {
  id: string;
  tipo: TipoMov;
  descricao: string;
  valor: number;            // sempre positivo; o sinal vem do tipo
  data: string;             // ISO: yyyy-mm-dd
  categoria: string;
  contaId: string;
  origem: Origem;
  faturaId?: string;
  parcela?: { atual: number; total: number };
  observacao?: string;
  hash?: string;            // usado na deteccao de duplicidade da importacao
}

export interface Conta {
  id: string;
  nome: string;
  tipo: 'corrente' | 'poupanca' | 'cartao' | 'carteira';
  saldoInicial: number;
  limite?: number;          // apenas cartao
  cor: string;
}

export interface Fatura {
  contaId?: string;
  id: string;
  emissor: string;
  referencia: string;       // "Abril 2025"
  valor: number;
  vencimento: string;       // ISO
  status: StatusFatura;
  arquivoNome?: string;
  arquivoTipo?: string;
  arquivoUrl?: string;      // object URL / data URL local
  paginas?: number;
  importada?: boolean;
  cor: string;
  sigla: string;
}

export interface Investimento {
  id: string;
  nome: string;
  modalidade: Modalidade;
  valorInvestido: number;
  rentabilidade: number;    // % acumulada informada pelo usuario
  atualizadoEm: string;     // ISO
  ativo: boolean;
}

export type Modalidade =
  | 'Renda fixa' | 'Tesouro Direto' | 'CDB' | 'LCI/LCA'
  | 'Fundos' | 'Ações' | 'ETFs' | 'Outros';

export interface Meta {
  id: string;
  nome: string;
  alvo: number;
  atual: number;
  prazo: string;            // ISO
  cor: string;
}

export interface Orcamento {
  categoria: string;
  limite: number;
}

export interface Recorrente {
  id: string;
  descricao: string;
  valor: number;
  diaVencimento: number;
  tipo: TipoMov;
  categoria: string;
  ativo: boolean;
}

export interface Usuario {
  nome: string;
  email: string;
  consentimentoIA: boolean;
  ocultarValores: boolean;
}

/* ---------- Importacao de documentos (IA) ---------- */

export type StatusRevisao = 'pendente' | 'aprovada' | 'duvida' | 'ignorada' | 'duplicada';

export interface TransacaoExtraida {
  id: string;
  data: string;
  descricao: string;
  descricaoOriginal: string;
  estabelecimento?: string;
  valor: number;
  tipo: TipoMov;
  categoria: string;
  confianca: number;        // 0..1
  parcela?: { atual: number; total: number };
  status: StatusRevisao;
  motivoDuvida?: string;
  pagamentoFatura?: boolean; // pagamento total da fatura: nao vira despesa
}

export interface DocumentoAnalisado {
  id: string;
  arquivoNome: string;
  arquivoTipo: string;
  arquivoUrl?: string;
  paginas: number;
  emissor: string;
  documento: 'fatura_cartao' | 'conta_consumo' | 'extrato' | 'comprovante' | 'desconhecido';
  totalDocumento?: number;
  vencimento?: string;
  linhaDigitavel?: string;
  transacoes: TransacaoExtraida[];
  analisadoEm: string;
  demo: boolean;            // true = extração simulada (sem credenciais de OCR/LLM)
}

export interface Mensagem {
  id: string;
  autor: 'user' | 'ia';
  texto: string;
  em: string;
  detalhe?: string;         // "de onde vem o número"
  sugestoes?: string[];
}

export interface EstadoApp {
  usuario: Usuario;
  contas: Conta[];
  movimentacoes: Movimentacao[];
  faturas: Fatura[];
  investimentos: Investimento[];
  metas: Meta[];
  orcamentos: Orcamento[];
  recorrentes: Recorrente[];
  categoriasCustom: string[];
  regrasCategoria: Record<string, string>;   // padrão -> categoria (aprendizado do usuário)
  conversas: Mensagem[];
  autenticado: boolean;
}
