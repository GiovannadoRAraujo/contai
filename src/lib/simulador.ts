/**
 * Motor de cálculo do simulador de investimentos.
 * Todas as projeções são estimativas: não há integração ativa com fonte de taxas
 * em tempo real, portanto os valores de referência abaixo são fixos e editáveis
 * manualmente pelo usuário (ver TAXAS_REFERENCIA.observacao).
 */

export type Indexador = 'CDI' | 'Prefixado' | 'IPCA+' | 'Selic' | 'Personalizado';

export interface TaxaReferencia {
  valor: number;      // % ao ano
  fonte: string;
  data: string;       // ISO
}

export const TAXAS_REFERENCIA: Record<'CDI' | 'SELIC' | 'IPCA', TaxaReferencia> & { observacao: string } = {
  CDI: { valor: 10.65, fonte: 'B3 — taxa DI acumulada', data: '2025-04-15' },
  SELIC: { valor: 10.75, fonte: 'Banco Central — meta Selic', data: '2025-04-15' },
  IPCA: { valor: 4.5, fonte: 'IBGE — IPCA acumulado 12 meses', data: '2025-04-15' },
  observacao:
    'Valores de referência armazenados no aplicativo. Não há integração ativa com fonte de taxas em tempo real — ajuste a taxa manualmente para refletir o cenário atual.',
};

export interface ParametrosSimulacao {
  indexador: Indexador;
  valorInicial: number;
  aporteMensal: number;
  meses: number;
  /** Taxa anual nominal usada no Prefixado/Personalizado, ou spread no IPCA+. */
  taxaAnual: number;
  /** Percentual do indexador (ex.: 100 = 100% do CDI). */
  percentualIndexador: number;
  isentoIR: boolean;
  taxaCustodiaAnual: number; // % a.a. (ex.: 0,20% Tesouro Direto)
}

export interface PontoSimulacao {
  mes: number;
  rotulo: string;
  aportado: number;
  bruto: number;
  rendimento: number;
}

export interface ResultadoSimulacao {
  taxaAnualEfetiva: number;
  taxaMensal: number;
  totalAportado: number;
  montanteBruto: number;
  rendimentoBruto: number;
  custodia: number;
  aliquotaIR: number;
  impostoIR: number;
  iof: number;
  rendimentoLiquido: number;
  patrimonioFinal: number;
  serie: PontoSimulacao[];
  premissas: string[];
}

/** Tabela regressiva do IR sobre renda fixa. */
export function aliquotaIR(dias: number) {
  if (dias <= 180) return 22.5;
  if (dias <= 360) return 20;
  if (dias <= 720) return 17.5;
  return 15;
}

/** IOF regressivo sobre o rendimento em resgates com menos de 30 dias. */
const TABELA_IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];
export function aliquotaIOF(dias: number) {
  if (dias >= 30) return 0;
  return TABELA_IOF[Math.max(0, dias - 1)] ?? 0;
}

export function taxaEfetivaAnual(p: ParametrosSimulacao): number {
  switch (p.indexador) {
    case 'CDI':
      return TAXAS_REFERENCIA.CDI.valor * (p.percentualIndexador / 100);
    case 'Selic':
      return TAXAS_REFERENCIA.SELIC.valor * (p.percentualIndexador / 100);
    case 'IPCA+':
      // Composição correta: (1+IPCA) * (1+spread) - 1
      return ((1 + TAXAS_REFERENCIA.IPCA.valor / 100) * (1 + p.taxaAnual / 100) - 1) * 100;
    case 'Prefixado':
    case 'Personalizado':
    default:
      return p.taxaAnual;
  }
}

export function simular(p: ParametrosSimulacao): ResultadoSimulacao {
  const meses = Math.max(1, Math.round(p.meses));
  const anual = taxaEfetivaAnual(p);
  const mensal = Math.pow(1 + anual / 100, 1 / 12) - 1;
  const custodiaMensal = Math.pow(1 + p.taxaCustodiaAnual / 100, 1 / 12) - 1;

  let bruto = p.valorInicial;
  let aportado = p.valorInicial;
  let custodia = 0;
  const serie: PontoSimulacao[] = [
    { mes: 0, rotulo: 'Início', aportado, bruto, rendimento: 0 },
  ];

  const inicio = new Date();
  for (let m = 1; m <= meses; m++) {
    bruto *= 1 + mensal;
    const custo = bruto * custodiaMensal;
    custodia += custo;
    bruto -= custo;
    if (p.aporteMensal > 0) {
      bruto += p.aporteMensal;
      aportado += p.aporteMensal;
    }
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + m, 1);
    serie.push({
      mes: m,
      rotulo: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][d.getMonth()],
      aportado: round(aportado),
      bruto: round(bruto),
      rendimento: round(bruto - aportado),
    });
  }

  const dias = Math.round(meses * 30.4);
  const rendimentoBruto = bruto - aportado;
  const iofPct = aliquotaIOF(dias);
  const iof = p.isentoIR ? 0 : Math.max(0, rendimentoBruto) * (iofPct / 100);
  const irPct = p.isentoIR ? 0 : aliquotaIR(dias);
  const impostoIR = Math.max(0, rendimentoBruto - iof) * (irPct / 100);
  const rendimentoLiquido = rendimentoBruto - impostoIR - iof;

  const premissas: string[] = [
    `Taxa efetiva considerada: ${anual.toFixed(2)}% ao ano (${mensal * 100 >= 0 ? (mensal * 100).toFixed(3) : '0'}% ao mês).`,
    `Prazo de ${meses} ${meses === 1 ? 'mês' : 'meses'} (≈ ${dias} dias corridos), sem resgates intermediários.`,
    p.isentoIR
      ? 'Produto marcado como isento de Imposto de Renda (ex.: LCI, LCA ou poupança).'
      : `Imposto de Renda pela tabela regressiva: ${pt(irPct)}% sobre o rendimento${iofPct > 0 ? `, mais IOF de ${pt(iofPct)}% por resgate em menos de 30 dias` : ""}.`,
    p.taxaCustodiaAnual > 0
      ? `Taxa de custódia de ${p.taxaCustodiaAnual}% ao ano descontada mensalmente.`
      : 'Sem taxa de custódia ou administração.',
    p.aporteMensal > 0
      ? `Aportes mensais de R$ ${p.aporteMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ao final de cada mês.`
      : 'Sem aportes mensais.',
  ];

  if (p.indexador === 'CDI') premissas.push(`CDI de referência: ${TAXAS_REFERENCIA.CDI.valor}% a.a. — ${TAXAS_REFERENCIA.CDI.fonte} (${br(TAXAS_REFERENCIA.CDI.data)}).`);
  if (p.indexador === 'Selic') premissas.push(`Selic de referência: ${TAXAS_REFERENCIA.SELIC.valor}% a.a. — ${TAXAS_REFERENCIA.SELIC.fonte} (${br(TAXAS_REFERENCIA.SELIC.data)}).`);
  if (p.indexador === 'IPCA+') premissas.push(`IPCA de referência: ${TAXAS_REFERENCIA.IPCA.valor}% a.a. — ${TAXAS_REFERENCIA.IPCA.fonte} (${br(TAXAS_REFERENCIA.IPCA.data)}).`);
  premissas.push('Taxa constante durante todo o período. Projeções não garantem rentabilidade futura e não constituem oferta ou recomendação de investimento.');

  return {
    taxaAnualEfetiva: anual,
    taxaMensal: mensal * 100,
    totalAportado: round(aportado),
    montanteBruto: round(bruto),
    rendimentoBruto: round(rendimentoBruto),
    custodia: round(custodia),
    aliquotaIR: irPct,
    impostoIR: round(impostoIR),
    iof: round(iof),
    rendimentoLiquido: round(rendimentoLiquido),
    patrimonioFinal: round(aportado + rendimentoLiquido),
    serie,
    premissas,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
const br = (iso: string) => iso.split('-').reverse().join('/');

const pt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
