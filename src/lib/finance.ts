import type { EstadoApp, Movimentacao } from '@/types';
import { MESES, addMeses, diasAte, mesAnterior, mesDe, plural } from './format';

export const noMes = (movs: Movimentacao[], ym: string) => movs.filter((m) => mesDe(m.data) === ym);

export const soma = (movs: Movimentacao[]) => movs.reduce((t, m) => t + m.valor, 0);

export const receitas = (movs: Movimentacao[]) => soma(movs.filter((m) => m.tipo === 'receita'));
export const despesas = (movs: Movimentacao[]) => soma(movs.filter((m) => m.tipo === 'despesa'));

export const variacao = (atual: number, anterior: number) => {
  if (!anterior) return atual ? 100 : 0;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
};

/** Saldo acumulado considerando saldos iniciais das contas + todo o histórico até o fim do mês. */
export function saldoAte(estado: EstadoApp, ym: string) {
  const base = estado.contas.filter((c) => c.tipo !== 'cartao').reduce((t, c) => t + c.saldoInicial, 0);
  const ate = estado.movimentacoes.filter((m) => mesDe(m.data) <= ym);
  return base + receitas(ate) - despesas(ate);
}

export function resumoMes(estado: EstadoApp, ym: string) {
  const mes = noMes(estado.movimentacoes, ym);
  const ant = noMes(estado.movimentacoes, mesAnterior(ym));

  const rec = receitas(mes);
  const des = despesas(mes);
  const recAnt = receitas(ant);
  const desAnt = despesas(ant);

  const saldo = saldoAte(estado, ym);
  const saldoAnt = saldoAte(estado, mesAnterior(ym));

  const pendentes = estado.faturas.filter((f) => f.status !== 'paga');
  const pendentesValor = pendentes.reduce((t, f) => t + f.valor, 0);
  const vencendoSemana = pendentes.filter((f) => {
    const d = diasAte(f.vencimento);
    return d >= 0 && d <= 7;
  }).length;

  return {
    ym,
    saldo,
    saldoVar: variacao(saldo, saldoAnt),
    receitas: rec,
    receitasVar: variacao(rec, recAnt),
    despesas: des,
    despesasVar: variacao(des, desAnt),
    liquido: rec - des,
    liquidoVar: variacao(rec - des, recAnt - desAnt),
    pendentesValor,
    pendentesQtd: pendentes.length,
    vencendoSemana,
    totalMovimentacoes: mes.length,
  };
}

export function porCategoria(movs: Movimentacao[], tipo: 'despesa' | 'receita' = 'despesa') {
  const mapa = new Map<string, number>();
  movs.filter((m) => m.tipo === tipo).forEach((m) => mapa.set(m.categoria, (mapa.get(m.categoria) ?? 0) + m.valor));
  const total = [...mapa.values()].reduce((a, b) => a + b, 0);
  return [...mapa.entries()]
    .map(([categoria, valor]) => ({ categoria, valor, pct: total ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Série dos últimos N meses terminando em `ym`. */
export function serieMeses(estado: EstadoApp, ym: string, n = 4) {
  const out: Array<{ mes: string; ym: string; receitas: number; despesas: number; saldo: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const alvo = addMeses(ym, -i);
    const movs = noMes(estado.movimentacoes, alvo);
    out.push({
      mes: MESES[Number(alvo.slice(5, 7)) - 1],
      ym: alvo,
      receitas: receitas(movs),
      despesas: despesas(movs),
      saldo: saldoAte(estado, alvo),
    });
  }
  return out;
}

export function patrimonio(estado: EstadoApp) {
  const ativos = estado.investimentos.filter((i) => i.ativo);
  const total = ativos.reduce((t, i) => t + i.valorInvestido, 0);
  const rendimento = ativos.reduce((t, i) => t + i.valorInvestido * (i.rentabilidade / 100), 0);
  const porModalidade = new Map<string, number>();
  ativos.forEach((i) => porModalidade.set(i.modalidade, (porModalidade.get(i.modalidade) ?? 0) + i.valorInvestido));
  return {
    total,
    rendimento,
    rentabilidadeMedia: total ? (rendimento / total) * 100 : 0,
    distribuicao: [...porModalidade.entries()]
      .map(([modalidade, valor]) => ({ modalidade, valor, pct: total ? (valor / total) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor),
  };
}

export function usoDoCartao(estado: EstadoApp) {
  return estado.contas
    .filter((c) => c.tipo === 'cartao' && c.limite)
    .map((c) => {
      const usado = estado.faturas
        .filter((f) => f.status !== 'paga' && f.emissor.toLowerCase().includes(c.nome.toLowerCase().split(' ')[0]))
        .reduce((t, f) => t + f.valor, 0);
      return { conta: c, usado, pct: c.limite ? (usado / c.limite) * 100 : 0 };
    });
}

export function alertas(estado: EstadoApp) {
  const lista: Array<{ id: string; tipo: 'conta' | 'cartao' | 'meta'; titulo: string; detalhe: string; cor: string; progresso?: number }> = [];

  estado.faturas
    .filter((f) => f.status !== 'paga')
    .map((f) => ({ f, d: diasAte(f.vencimento) }))
    .filter(({ d }) => d >= -30 && d <= 10)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .forEach(({ f, d }) => {
      const nome = f.referencia.toLowerCase().includes('fatura') ? `Fatura ${f.emissor}` : f.referencia;
      lista.push({
        id: `f-${f.id}`,
        tipo: 'conta',
        titulo:
          d < 0 ? `${nome} venceu há ${plural(Math.abs(d), 'dia', 'dias')}`
            : d === 0 ? `${nome} vence hoje`
              : `${nome} vence em ${plural(d, 'dia', 'dias')}`,
        detalhe: `R$ ${f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        cor: d < 0 ? '#F052A0' : '#FF9F43',
      });
    });

  usoDoCartao(estado)
    .filter((c) => c.pct >= 50)
    .slice(0, 2)
    .forEach((c) =>
      lista.push({
        id: `c-${c.conta.id}`,
        tipo: 'cartao',
        titulo: `Cartão ${c.conta.nome} próximo do limite`,
        detalhe: `${c.pct.toFixed(0)}% utilizado`,
        cor: '#8B5CF6',
        progresso: Math.min(100, c.pct),
      }),
    );

  estado.metas
    .filter((m) => m.alvo > 0)
    .sort((a, b) => b.atual / b.alvo - a.atual / a.alvo)
    .slice(0, 2)
    .forEach((m) => {
      const p = (m.atual / m.alvo) * 100;
      lista.push({
        id: `m-${m.id}`,
        tipo: 'meta',
        titulo: `Meta ${m.nome} está ${p.toFixed(0)}% concluída`,
        detalhe: p >= 100 ? 'Objetivo alcançado' : `Faltam R$ ${(m.alvo - m.atual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        cor: p >= 100 ? '#2DE2A6' : '#2DE2A6',
        progresso: Math.min(100, p),
      });
    });

  return lista.slice(0, 5);
}

/** Orçamento planejado x realizado no mês. */
export function orcamentoVsReal(estado: EstadoApp, ym: string) {
  const movs = noMes(estado.movimentacoes, ym);
  return estado.orcamentos.map((o) => {
    const gasto = soma(movs.filter((m) => m.tipo === 'despesa' && m.categoria === o.categoria));
    return { ...o, gasto, pct: o.limite ? (gasto / o.limite) * 100 : 0, restante: o.limite - gasto };
  });
}

/** Chave usada para detectar lançamentos duplicados na importação. */
export const hashMov = (data: string, valor: number, descricao: string) =>
  `${data}|${valor.toFixed(2)}|${descricao.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18)}`;

/** Agrupa modalidades em classes de ativo, como a carteira é apresentada no dashboard. */
export function classeInvestimento(modalidade: string) {
  if (['Renda fixa', 'Tesouro Direto', 'CDB', 'LCI/LCA'].includes(modalidade)) return 'Renda fixa';
  if (modalidade === 'Ações') return 'Ações';
  if (modalidade === 'Fundos') return 'Fundos';
  return 'Outros';
}

export function carteiraPorClasse(estado: EstadoApp) {
  const mapa = new Map<string, number>();
  estado.investimentos.filter((i) => i.ativo).forEach((i) => {
    const c = classeInvestimento(i.modalidade);
    mapa.set(c, (mapa.get(c) ?? 0) + i.valorInvestido);
  });
  const total = [...mapa.values()].reduce((a, b) => a + b, 0);
  const ordem = ['Renda fixa', 'Ações', 'Fundos', 'Outros'];
  return [...mapa.entries()]
    .map(([categoria, valor]) => ({ categoria, valor, pct: total ? (valor / total) * 100 : 0 }))
    .sort((a, b) => ordem.indexOf(a.categoria) - ordem.indexOf(b.categoria));
}

/**
 * Série estimada da evolução do patrimônio investido.
 * Não há histórico de cotações: os pontos anteriores são reconstruídos a partir
 * da rentabilidade acumulada que o próprio usuário informou em cada ativo.
 */
export function serieEstimadaPatrimonio(estado: EstadoApp, n = 6) {
  const ativos = estado.investimentos.filter((i) => i.ativo);
  const total = ativos.reduce((t, i) => t + i.valorInvestido, 0);
  const rentMedia = total ? ativos.reduce((t, i) => t + i.valorInvestido * (i.rentabilidade / 100), 0) / total : 0;
  const hoje = new Date();
  return Array.from({ length: n }, (_, idx) => {
    const passos = n - 1 - idx;
    const fator = Math.pow(1 + rentMedia, -passos / n);
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - passos, 1);
    return { mes: MESES[d.getMonth()], v: Math.round(total * fator * 100) / 100, saldo: Math.round(total * fator * 100) / 100 };
  });
}

/** Agrupa as categorias menores sob "Outros" para a rosca do dashboard. */
export function topCategorias(
  lista: Array<{ categoria: string; valor: number; pct: number }>,
  limite = 6,
) {
  const nomeadas = lista.filter((c) => c.categoria !== 'Outros');
  const jaOutros = lista.filter((c) => c.categoria === 'Outros');
  if (nomeadas.length <= limite && !jaOutros.length) return lista;
  const principais = nomeadas.slice(0, limite);
  const resto = [...nomeadas.slice(limite), ...jaOutros];
  if (!resto.length) return principais;
  const valor = resto.reduce((t, c) => t + c.valor, 0);
  const pct = resto.reduce((t, c) => t + c.pct, 0);
  return [...principais, { categoria: 'Outros', valor, pct }];
}
