/**
 * Motor de cálculo do simulador de investimentos.
 * Todas as projeções são estimativas com taxa constante. As taxas de referência
 * (CDI, Selic, IPCA) vêm de `taxas.ts`: do Banco Central quando o usuário
 * atualiza, ou de valores armazenados no app, sempre com fonte e data.
 */
import { TAXAS_REFERENCIA, type ChaveTaxa, type TaxaEmUso } from './taxas';

export type Indexador = 'CDI' | 'Prefixado' | 'IPCA+' | 'Selic' | 'Personalizado';

export interface ParametrosSimulacao {
  indexador: Indexador;
  valorInicial: number;
  aporteMensal: number;
  meses: number;
  /** Taxa anual nominal no Prefixado/Personalizado, ou taxa real (spread) no IPCA+. */
  taxaAnual: number;
  /** Percentual do indexador (ex.: 100 = 100% do CDI). */
  percentualIndexador: number;
  isentoIR: boolean;
  taxaCustodiaAnual: number; // % a.a. (ex.: 0,20% no Tesouro Direto)
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
  montanteBruto: number;      // sem custos nem impostos
  rendimentoBruto: number;    // montanteBruto − aportado
  custodia: number;
  aliquotaIR: number;         // alíquota do valor inicial (ou do 1º aporte)
  aliquotasIR: number[];      // alíquotas distintas aplicadas aos aportes
  impostoIR: number;
  iof: number;
  rendimentoLiquido: number;
  patrimonioFinal: number;
  serie: PontoSimulacao[];
  premissas: string[];
}

/** Tabela regressiva do IR sobre renda fixa (dias corridos). */
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

type Taxas = Record<ChaveTaxa, TaxaEmUso>;

export function taxaEfetivaAnual(p: ParametrosSimulacao, taxas: Taxas = TAXAS_REFERENCIA): number {
  switch (p.indexador) {
    case 'CDI':
      return taxas.CDI.valor * (p.percentualIndexador / 100);
    case 'Selic':
      return taxas.SELIC.valor * (p.percentualIndexador / 100);
    case 'IPCA+':
      // Composição correta: (1 + IPCA) × (1 + taxa real) − 1
      return ((1 + taxas.IPCA.valor / 100) * (1 + p.taxaAnual / 100) - 1) * 100;
    case 'Prefixado':
    case 'Personalizado':
    default:
      return p.taxaAnual;
  }
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS_POR_MES = 30.4375;

export function simular(p: ParametrosSimulacao, taxas: Taxas = TAXAS_REFERENCIA): ResultadoSimulacao {
  const meses = Math.max(1, Math.min(600, Math.round(p.meses)));
  const valorInicial = Math.max(0, p.valorInicial || 0);
  const aporte = Math.max(0, p.aporteMensal || 0);
  const anual = taxaEfetivaAnual(p, taxas);
  // Periodicidade: taxa anual convertida em mensal equivalente (juros compostos)
  const mensal = Math.pow(1 + anual / 100, 1 / 12) - 1;
  const custodiaMensal = Math.pow(1 + Math.max(0, p.taxaCustodiaAnual) / 100, 1 / 12) - 1;

  // Série mês a mês (para o gráfico)
  let saldo = valorInicial;
  let aportado = valorInicial;
  const serie: PontoSimulacao[] = [{ mes: 0, rotulo: 'Início', aportado, bruto: valorInicial, rendimento: 0 }];
  const inicio = new Date();
  for (let m = 1; m <= meses; m++) {
    saldo *= 1 + mensal;
    saldo -= saldo * custodiaMensal;
    if (aporte > 0 && m < meses) { saldo += aporte; aportado += aporte; }
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + m, 1);
    serie.push({ mes: m, rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, aportado: r2(aportado), bruto: r2(saldo), rendimento: r2(saldo - aportado) });
  }

  // Tributação por "safra": cada aporte tem o próprio prazo e a própria alíquota.
  // Aportes ao fim de cada mês (o do último mês não chega a render e é omitido).
  const safras: Array<{ valor: number; mesesAplicado: number }> = [];
  if (valorInicial > 0) safras.push({ valor: valorInicial, mesesAplicado: meses });
  if (aporte > 0) for (let k = 1; k < meses; k++) safras.push({ valor: aporte, mesesAplicado: meses - k });

  let montanteBruto = 0; let custodia = 0; let impostoIR = 0; let iof = 0; let totalAportado = 0;
  const aliquotas = new Set<number>();
  for (const s of safras) {
    const semCusto = s.valor * Math.pow(1 + mensal, s.mesesAplicado);
    const comCusto = s.valor * Math.pow((1 + mensal) * (1 - custodiaMensal), s.mesesAplicado);
    const rendimento = comCusto - s.valor;
    const dias = Math.round(s.mesesAplicado * DIAS_POR_MES);
    const iofS = p.isentoIR ? 0 : Math.max(0, rendimento) * (aliquotaIOF(dias) / 100);
    const aliq = p.isentoIR ? 0 : aliquotaIR(dias);
    if (!p.isentoIR) aliquotas.add(aliq);
    montanteBruto += semCusto;
    custodia += semCusto - comCusto;
    iof += iofS;
    impostoIR += Math.max(0, rendimento - iofS) * (aliq / 100);
    totalAportado += s.valor;
  }

  const rendimentoBruto = montanteBruto - totalAportado;
  const rendimentoLiquido = rendimentoBruto - custodia - impostoIR - iof;
  const diasTotais = Math.round(meses * DIAS_POR_MES);
  const listaAliq = [...aliquotas].sort((a, b) => b - a);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const premissas: string[] = [
    `Taxa efetiva considerada: ${fmt(anual)}% ao ano, convertida para ${(mensal * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% ao mês por juros compostos, constante durante todo o prazo.`,
    `Prazo de ${meses} ${meses === 1 ? 'mês' : 'meses'} (≈ ${diasTotais} dias corridos), com resgate total no fim e sem resgates intermediários.`,
    aporte > 0
      ? `Aportes de ${brl(aporte)} ao fim de cada mês (${meses - 1} aportes). Cada aporte é tributado pelo seu próprio prazo.`
      : 'Sem aportes mensais.',
    p.isentoIR
      ? 'Produto marcado como isento de Imposto de Renda para pessoa física (ex.: LCI, LCA). Verifique as condições do produto.'
      : `Imposto de Renda pela tabela regressiva da renda fixa (${listaAliq.map((a) => `${fmt(a)}%`).join(', ')}) sobre o rendimento após custos${iof > 0 ? ', mais IOF regressivo para valores aplicados por menos de 30 dias' : ''}.`,
    p.taxaCustodiaAnual > 0
      ? `Taxa de custódia/administração de ${fmt(p.taxaCustodiaAnual)}% ao ano, descontada mensalmente.`
      : 'Sem taxa de custódia ou administração informada.',
  ];
  const t = p.indexador === 'CDI' ? taxas.CDI : p.indexador === 'Selic' ? taxas.SELIC : p.indexador === 'IPCA+' ? taxas.IPCA : null;
  if (t) {
    const nome = p.indexador === 'IPCA+' ? 'IPCA (12 meses)' : p.indexador;
    premissas.push(`${nome}: ${fmt(t.valor)}% a.a. — ${t.fonte}, dado de ${br(t.data)}${t.origem === 'referencia' ? ' (valor armazenado no app; pode estar desatualizado)' : t.origem === 'manual' ? ' (taxa informada por você — simulação ilustrativa)' : ''}. A projeção assume que essa taxa se mantém.`);
  }
  if (p.indexador === 'IPCA+') premissas.push('No IPCA+, a inflação futura é desconhecida: a projeção usa a inflação dos últimos 12 meses como se fosse constante.');
  premissas.push('Não considera come-cotas, spread, taxas de corretagem, marcação a mercado nem eventos de crédito. Projeções não garantem rentabilidade futura e não constituem oferta ou recomendação de investimento.');

  return {
    taxaAnualEfetiva: anual,
    taxaMensal: mensal * 100,
    totalAportado: r2(totalAportado),
    montanteBruto: r2(montanteBruto),
    rendimentoBruto: r2(rendimentoBruto),
    custodia: r2(custodia),
    aliquotaIR: listaAliq.at(-1) ?? 0,
    aliquotasIR: listaAliq,
    impostoIR: r2(impostoIR),
    iof: r2(iof),
    rendimentoLiquido: r2(rendimentoLiquido),
    patrimonioFinal: r2(totalAportado + rendimentoLiquido),
    serie,
    premissas,
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const br = (iso: string) => iso.split('-').reverse().join('/');
