import { DICIONARIO, normalizar } from './categorias';
import type { TipoMov } from '@/types';

export interface Classificacao {
  categoria: string;
  confianca: number; // 0..1
  motivo: string;
}

/** Termos que indicam entrada de dinheiro mesmo dentro de uma fatura/extrato. */
const TERMOS_RECEITA = [
  'estorno', 'devolucao', 'reembolso', 'credito recebido', 'pix recebido',
  'salario', 'rendimento', 'cashback', 'ajuste a credito', 'pagamento recebido',
];

const TERMOS_PAGAMENTO_FATURA = [
  'pagamento recebido', 'pagamento de fatura', 'pgto fatura', 'pagamento efetuado',
  'saldo em aberto anterior', 'total da fatura anterior',
];

export function detectarTipo(descricao: string): TipoMov {
  const d = normalizar(descricao);
  return TERMOS_RECEITA.some((t) => d.includes(t)) ? 'receita' : 'despesa';
}

export function ehPagamentoDeFatura(descricao: string): boolean {
  const d = normalizar(descricao);
  return TERMOS_PAGAMENTO_FATURA.some((t) => d.includes(t));
}

/** "PARC 03/10" | "3/10" | "(2 de 6)" */
export function detectarParcela(descricao: string): { atual: number; total: number } | undefined {
  const m =
    descricao.match(/(\d{1,2})\s*\/\s*(\d{1,2})/) ??
    descricao.match(/(\d{1,2})\s*de\s*(\d{1,2})/i);
  if (!m) return undefined;
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (!total || atual > total || total > 48) return undefined;
  return { atual, total };
}

/**
 * Classifica uma transação a partir da descrição.
 * Regras aprendidas com o usuário têm prioridade sobre o dicionário interno.
 */
export function classificar(
  descricao: string,
  tipo: TipoMov,
  regras: Record<string, string> = {},
): Classificacao {
  const d = normalizar(descricao);

  for (const [padrao, categoria] of Object.entries(regras)) {
    if (padrao && d.includes(normalizar(padrao))) {
      return { categoria, confianca: 0.99, motivo: `Regra salva por você para "${padrao}"` };
    }
  }

  if (tipo === 'receita') {
    if (d.includes('salario') || d.includes('folha')) return { categoria: 'Salário', confianca: 0.95, motivo: 'Descrição indica folha de pagamento' };
    if (d.includes('estorno') || d.includes('devolucao')) return { categoria: 'Estorno', confianca: 0.9, motivo: 'Lançamento identificado como estorno' };
    if (d.includes('reembolso')) return { categoria: 'Reembolso', confianca: 0.88, motivo: 'Lançamento identificado como reembolso' };
    if (d.includes('rendimento') || d.includes('cdb') || d.includes('tesouro')) return { categoria: 'Rendimentos', confianca: 0.85, motivo: 'Descrição sugere rendimento de aplicação' };
    if (d.includes('pix recebido') || d.includes('ted recebid')) return { categoria: 'Transferências', confianca: 0.8, motivo: 'Transferência recebida' };
    return { categoria: 'Outros', confianca: 0.35, motivo: 'Não foi possível identificar a origem da receita' };
  }

  let melhor: { categoria: string; termo: string } | null = null;
  for (const grupo of DICIONARIO) {
    for (const termo of grupo.termos) {
      if (d.includes(termo) && (!melhor || termo.length > melhor.termo.length)) {
        melhor = { categoria: grupo.categoria, termo };
      }
    }
  }

  if (melhor) {
    // termos mais específicos geram confiança maior
    const confianca = Math.min(0.96, 0.62 + melhor.termo.replace(/\s/g, '').length * 0.035);
    return { categoria: melhor.categoria, confianca, motivo: `Estabelecimento reconhecido pelo termo "${melhor.termo.trim()}"` };
  }

  // Descrições com códigos de adquirente costumam ser ambíguas
  if (/^[a-z]{2,4}\*/i.test(descricao) || /\d{4,}/.test(descricao.replace(/[^\d]/g, '').slice(0, 20))) {
    return { categoria: 'Outros', confianca: 0.28, motivo: 'Descrição com código de intermediador de pagamento, sem estabelecimento claro' };
  }

  return { categoria: 'Outros', confianca: 0.32, motivo: 'Estabelecimento não reconhecido no dicionário de categorias' };
}

export const LIMITE_CONFIANCA = 0.6;
