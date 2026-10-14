import type { EstadoApp } from '@/types';
import { brl, dataBR, diasAte, mesAnterior, mesDe, num, rotuloMes } from './format';
import { despesas as somaDespesas, noMes, orcamentoVsReal, patrimonio, porCategoria, receitas as somaReceitas, resumoMes, saldoAte } from './finance';
import { normalizar } from './categorias';
import { simular, TAXAS_REFERENCIA } from './simulador';
import { IA_CONFIGURADA, IA_ENDPOINT } from './documentos';

export interface Resposta {
  texto: string;
  detalhe?: string;
  sugestoes?: string[];
}

export const SUGESTOES_INICIAIS = [
  'Quanto eu gastei em alimentação este mês?',
  'Quais contas vencem esta semana?',
  'Quanto posso gastar até o final do mês?',
  'Quanto renderia R$ 5.000 a 100% do CDI em 12 meses?',
  'Como está minha situação financeira?',
  'Quais assinaturas estão pesando no meu orçamento?',
];

const CATEGORIAS_BUSCA = [
  'alimentação', 'moradia', 'transporte', 'saúde', 'educação', 'lazer', 'compras',
  'assinaturas', 'serviços', 'impostos e taxas', 'investimentos', 'transferências',
];

/** Motor local do Assistente contAI: responde apenas com dados do próprio aplicativo. */
export function responderLocal(pergunta: string, estado: EstadoApp, ym: string): Resposta {
  const p = normalizar(pergunta);
  const movsMes = noMes(estado.movimentacoes, ym);
  const resumo = resumoMes(estado, ym);
  const fonte = `Fonte: ${movsMes.length} movimentações registradas em ${rotuloMes(ym)}.`;

  if (!estado.usuario.consentimentoIA) {
    return {
      texto:
        'Para responder usando os seus dados financeiros, preciso da sua autorização. ' +
        'Você pode ativar o consentimento em Configurações › Privacidade a qualquer momento — e revogar depois.',
      detalhe: 'Nenhum dado foi lido nesta resposta.',
    };
  }

  if (!estado.movimentacoes.length) {
    return {
      texto: 'Ainda não há movimentações registradas, então não tenho base para calcular nada. Cadastre uma receita ou despesa, ou envie uma fatura em Faturas, que eu passo a analisar.',
      sugestoes: ['Como adiciono uma despesa?'],
    };
  }

  /* ---------- gasto por categoria ---------- */
  const catEncontrada = CATEGORIAS_BUSCA.find((c) => p.includes(normalizar(c)));
  if (catEncontrada && /(gast|quanto|despes|total)/.test(p)) {
    const alvo = normalizar(catEncontrada);
    const doMes = movsMes.filter((m) => m.tipo === 'despesa' && normalizar(m.categoria) === alvo);
    const total = doMes.reduce((t, m) => t + m.valor, 0);
    const ant = noMes(estado.movimentacoes, mesAnterior(ym)).filter(
      (m) => m.tipo === 'despesa' && normalizar(m.categoria) === alvo,
    );
    const totalAnt = ant.reduce((t, m) => t + m.valor, 0);
    const share = resumo.despesas ? (total / resumo.despesas) * 100 : 0;
    const dif = totalAnt ? ((total - totalAnt) / totalAnt) * 100 : 0;

    if (!doMes.length) {
      return {
        texto: `Não encontrei nenhuma despesa de ${catEncontrada} em ${rotuloMes(ym)}.`,
        detalhe: fonte,
      };
    }
    return {
      texto:
        `Você gastou ${brl(total)} com ${catEncontrada} em ${rotuloMes(ym)}, o que representa ${num(share, 0)}% do total de despesas (${brl(resumo.despesas)}). ` +
        (totalAnt
          ? `Comparando ao mês anterior (${brl(totalAnt)}), houve ${dif >= 0 ? 'um aumento' : 'uma redução'} de ${num(Math.abs(dif), 0)}%.`
          : 'Não há mês anterior com despesas nessa categoria para comparar.'),
      detalhe: `${doMes.length} lançamento(s): ${doMes.slice(0, 4).map((m) => `${m.descricao} (${brl(m.valor)})`).join(', ')}${doMes.length > 4 ? '…' : ''}`,
      sugestoes: ['Quais despesas aumentaram?', 'Quanto posso gastar até o final do mês?'],
    };
  }

  /* ---------- contas a vencer ---------- */
  if (/(vence|vencimento|conta.*pagar|pagar.*semana|boleto)/.test(p)) {
    const proximas = estado.faturas
      .filter((f) => f.status !== 'paga')
      .map((f) => ({ f, d: diasAte(f.vencimento) }))
      .filter(({ d }) => d >= -15 && d <= (/semana/.test(p) ? 7 : 30))
      .sort((a, b) => a.d - b.d);

    if (!proximas.length) {
      return { texto: 'Nenhuma conta em aberto com vencimento nesse intervalo.', detalhe: `Fonte: ${estado.faturas.length} faturas cadastradas.` };
    }
    const total = proximas.reduce((t, { f }) => t + f.valor, 0);
    return {
      texto:
        `Encontrei ${proximas.length} conta(s) somando ${brl(total)}:\n` +
        proximas
          .map(({ f, d }) => `• ${f.emissor} — ${brl(f.valor)} — vence ${dataBR(f.vencimento)}${d < 0 ? ` (vencida há ${Math.abs(d)} dia(s))` : d === 0 ? ' (hoje)' : ` (em ${d} dia(s))`}`)
          .join('\n'),
      detalhe: 'Fonte: faturas cadastradas na tela Faturas com status diferente de "paga".',
      sugestoes: ['Como está minha situação financeira?'],
    };
  }

  /* ---------- quanto posso gastar ---------- */
  if (/(posso gastar|quanto sobra|sobra|ate o final do mes|até o final do mês|disponivel)/.test(p)) {
    const hoje = new Date();
    const ultimoDia = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    const diaAtual = mesDe(hoje.toISOString()) === ym ? hoje.getDate() : ultimoDia;
    const diasRestantes = Math.max(0, ultimoDia - diaAtual);
    const contasAbertas = estado.faturas.filter((f) => f.status !== 'paga' && mesDe(f.vencimento) === ym).reduce((t, f) => t + f.valor, 0);
    const disponivel = resumo.liquido - contasAbertas;

    return {
      texto:
        `Em ${rotuloMes(ym)} você recebeu ${brl(resumo.receitas)} e gastou ${brl(resumo.despesas)}, deixando ${brl(resumo.liquido)} de resultado. ` +
        `Descontando ${brl(contasAbertas)} de contas ainda em aberto neste mês, restam ${brl(disponivel)}` +
        (diasRestantes > 0
          ? ` — cerca de ${brl(disponivel / diasRestantes)} por dia nos ${diasRestantes} dias que faltam.`
          : '.') +
        (disponivel < 0 ? '\n\nO valor está negativo: as despesas e contas em aberto superam as receitas do mês.' : ''),
      detalhe: `${fonte} Contas em aberto com vencimento no mês: ${brl(contasAbertas)}.`,
      sugestoes: ['Quais despesas aumentaram?', 'Quais assinaturas estão pesando no meu orçamento?'],
    };
  }

  /* ---------- despesas que aumentaram ---------- */
  if (/(aumentar|aumentou|subiu|cresceu|variacao|comparar)/.test(p)) {
    const atual = porCategoria(movsMes);
    const ant = porCategoria(noMes(estado.movimentacoes, mesAnterior(ym)));
    const mapaAnt = new Map(ant.map((c) => [c.categoria, c.valor]));
    const difs = atual
      .map((c) => ({ ...c, antes: mapaAnt.get(c.categoria) ?? 0 }))
      .map((c) => ({ ...c, dif: c.valor - c.antes, pct: c.antes ? ((c.valor - c.antes) / c.antes) * 100 : 100 }))
      .filter((c) => c.dif > 0)
      .sort((a, b) => b.dif - a.dif)
      .slice(0, 4);

    if (!difs.length) {
      return { texto: `Nenhuma categoria de despesa aumentou em ${rotuloMes(ym)} na comparação com o mês anterior.`, detalhe: fonte };
    }
    return {
      texto:
        `Categorias que subiram em ${rotuloMes(ym)}:\n` +
        difs.map((c) => `• ${c.categoria}: ${brl(c.antes)} → ${brl(c.valor)} (+${brl(c.dif)}, ${num(c.pct, 0)}%)`).join('\n'),
      detalhe: `Comparação entre ${rotuloMes(ym)} e ${rotuloMes(mesAnterior(ym))}, usando apenas despesas.`,
      sugestoes: ['Quanto posso gastar até o final do mês?'],
    };
  }

  /* ---------- assinaturas ---------- */
  if (/(assinatura|recorrente|mensalidade|streaming)/.test(p)) {
    const ass = movsMes.filter((m) => m.tipo === 'despesa' && normalizar(m.categoria) === 'assinaturas');
    const recorrentes = estado.recorrentes.filter((r) => r.ativo && r.tipo === 'despesa');
    const totalAss = ass.reduce((t, m) => t + m.valor, 0);
    const totalRec = recorrentes.reduce((t, r) => t + r.valor, 0);
    if (!ass.length && !recorrentes.length) {
      return { texto: 'Não encontrei assinaturas nem contas recorrentes cadastradas.', detalhe: fonte };
    }
    return {
      texto:
        `Assinaturas lançadas em ${rotuloMes(ym)}: ${brl(totalAss)} (${num(resumo.despesas ? (totalAss / resumo.despesas) * 100 : 0, 1)}% das despesas).\n` +
        ass.map((m) => `• ${m.descricao}: ${brl(m.valor)}`).join('\n') +
        (recorrentes.length
          ? `\n\nContas recorrentes cadastradas em Planejamento somam ${brl(totalRec)} por mês, o que equivale a ${brl(totalRec * 12)} em um ano.`
          : ''),
      detalhe: 'Fonte: movimentações da categoria Assinaturas + contas recorrentes do Planejamento.',
    };
  }

  /* ---------- metas ---------- */
  if (/(meta|guardar|economizar|objetivo|juntar)/.test(p)) {
    if (!estado.metas.length) {
      return { texto: 'Você ainda não criou metas. Em Planejamento › Metas é possível definir um objetivo, o valor alvo e o prazo.', sugestoes: ['Como está minha situação financeira?'] };
    }
    const linhas = estado.metas.map((m) => {
      const falta = Math.max(0, m.alvo - m.atual);
      const meses = Math.max(1, Math.ceil((new Date(`${m.prazo}T00:00:00`).getTime() - Date.now()) / (86400000 * 30.4)));
      return `• ${m.nome}: ${brl(m.atual)} de ${brl(m.alvo)} (${num((m.atual / m.alvo) * 100, 0)}%). ${falta === 0 ? 'Meta concluída.' : `Faltam ${brl(falta)} — cerca de ${brl(falta / meses)} por mês até ${dataBR(m.prazo)}.`}`;
    });
    return {
      texto: `Suas metas:\n${linhas.join('\n')}`,
      detalhe: `Cálculo: (valor alvo − valor guardado) ÷ meses restantes até o prazo. Seu resultado médio recente é de ${brl(resumo.liquido)} por mês.`,
    };
  }

  /* ---------- simulação de investimento ---------- */
  if (/(render|investir|investid|cdi|selic|aplicar|rentabilidade)/.test(p)) {
    const valor = extrairValor(p) ?? Math.max(1000, Math.round(resumo.liquido));
    const meses = extrairMeses(p) ?? 12;
    const percentual = extrairPercentualCDI(p) ?? 100;
    const r = simular({
      indexador: 'CDI',
      valorInicial: valor,
      aporteMensal: 0,
      meses,
      taxaAnual: TAXAS_REFERENCIA.CDI.valor,
      percentualIndexador: percentual,
      isentoIR: false,
      taxaCustodiaAnual: 0,
    });
    return {
      texto:
        `Considerando ${percentual}% do CDI (${TAXAS_REFERENCIA.CDI.valor}% a.a. de referência), ${brl(valor)} em ${meses} meses resultariam em aproximadamente ${brl(r.patrimonioFinal)}.\n` +
        `• Rendimento bruto: ${brl(r.rendimentoBruto)}\n• Imposto de Renda estimado (${r.aliquotaIR}%): ${brl(r.impostoIR)}\n• Rendimento líquido: ${brl(r.rendimentoLiquido)}`,
      detalhe:
        `${TAXAS_REFERENCIA.CDI.fonte}, referência de ${dataBR(TAXAS_REFERENCIA.CDI.data)}. ` +
        'Estimativa ilustrativa, com taxa constante e sem resgates. Projeções não garantem rentabilidade futura e não constituem recomendação de investimento.',
      sugestoes: ['Abrir o simulador completo'],
    };
  }

  /* ---------- patrimônio / investimentos ---------- */
  if (/(patrimonio|carteira|quanto tenho investido)/.test(p)) {
    const pat = patrimonio(estado);
    if (!pat.total) return { texto: 'Não há investimentos cadastrados. Você pode cadastrar manualmente em Investimentos.', detalhe: 'Não há integração ativa com corretoras.' };
    return {
      texto:
        `Seu patrimônio investido é de ${brl(pat.total)}, com rentabilidade média informada de ${num(pat.rentabilidadeMedia, 2)}% (≈ ${brl(pat.rendimento)}).\n` +
        pat.distribuicao.map((d) => `• ${d.modalidade}: ${brl(d.valor)} (${num(d.pct, 0)}%)`).join('\n'),
      detalhe: 'Fonte: ativos cadastrados manualmente na tela Investimentos. A rentabilidade é a informada por você, não há cotação em tempo real.',
    };
  }

  /* ---------- maiores gastos ---------- */
  if (/(maior|top|onde gastei|mais gastei|principais)/.test(p)) {
    const top = [...movsMes].filter((m) => m.tipo === 'despesa').sort((a, b) => b.valor - a.valor).slice(0, 5);
    return {
      texto: `Maiores despesas de ${rotuloMes(ym)}:\n${top.map((m, i) => `${i + 1}. ${m.descricao} — ${brl(m.valor)} (${m.categoria}, ${dataBR(m.data)})`).join('\n')}`,
      detalhe: fonte,
    };
  }

  /* ---------- situação geral / saldo ---------- */
  if (/(situacao|como estou|resumo|saldo|panorama|financeira)/.test(p)) {
    const orc = orcamentoVsReal(estado, ym).filter((o) => o.pct > 100);
    const pat = patrimonio(estado);
    return {
      texto:
        `Panorama de ${rotuloMes(ym)}:\n` +
        `• Saldo em contas: ${brl(saldoAte(estado, ym))}\n` +
        `• Receitas: ${brl(resumo.receitas)} (${resumo.receitasVar >= 0 ? '+' : ''}${num(resumo.receitasVar, 0)}% vs. mês anterior)\n` +
        `• Despesas: ${brl(resumo.despesas)} (${resumo.despesasVar >= 0 ? '+' : ''}${num(resumo.despesasVar, 0)}%)\n` +
        `• Resultado do mês: ${brl(resumo.liquido)}\n` +
        `• Contas em aberto: ${brl(resumo.pendentesValor)} em ${resumo.pendentesQtd} documento(s)\n` +
        `• Investido: ${brl(pat.total)}\n` +
        (orc.length
          ? `\nOrçamento estourado em: ${orc.map((o) => `${o.categoria} (${num(o.pct, 0)}%)`).join(', ')}.`
          : '\nNenhuma categoria ultrapassou o orçamento planejado.'),
      detalhe: `${fonte} Saldo = saldo inicial das contas + receitas − despesas acumuladas.`,
      sugestoes: ['Quais despesas aumentaram?', 'Quanto posso gastar até o final do mês?'],
    };
  }

  /* ---------- fallback honesto ---------- */
  return {
    texto:
      'Não consegui identificar o que você quer saber a partir dessa pergunta, e prefiro não adivinhar números. ' +
      'Consigo responder sobre: gastos por categoria, comparação entre meses, contas a vencer, quanto sobra no mês, metas, assinaturas e simulação de rendimento.\n\n' +
      'Sobre qual desses assuntos você quer falar — ou qual período devo considerar?',
    detalhe: `Dados disponíveis: ${estado.movimentacoes.length} movimentações, ${estado.faturas.length} faturas, ${estado.investimentos.length} investimentos.`,
    sugestoes: SUGESTOES_INICIAIS.slice(0, 4),
  };
}

/* ---------- extratores de parâmetros do texto ---------- */
function extrairValor(p: string): number | null {
  const m = p.match(/r?\$?\s*([\d.]+,\d{2}|\d[\d.]*)/);
  if (!m) return null;
  const bruto = m[1];
  const v = bruto.includes(',')
    ? Number(bruto.replace(/\./g, '').replace(',', '.'))
    : Number(bruto.replace(/\.(?=\d{3}\b)/g, ''));
  return Number.isFinite(v) && v >= 100 ? v : null;
}
function extrairMeses(p: string): number | null {
  const m = p.match(/(\d{1,3})\s*(mes|meses|m)\b/);
  if (m) return Number(m[1]);
  const a = p.match(/(\d{1,2})\s*(ano|anos)\b/);
  if (a) return Number(a[1]) * 12;
  return null;
}
function extrairPercentualCDI(p: string): number | null {
  const m = p.match(/(\d{2,3})\s*%\s*(do\s*)?cdi/);
  return m ? Number(m[1]) : null;
}

/** Usa o backend de IA quando configurado; caso contrário, o motor local. */
export async function perguntar(pergunta: string, estado: EstadoApp, ym: string): Promise<Resposta> {
  if (IA_CONFIGURADA && estado.usuario.consentimentoIA) {
    try {
      const resp = await fetch(`${IA_ENDPOINT}/assistente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pergunta,
          periodo: ym,
          contexto: {
            resumo: resumoMes(estado, ym),
            categorias: porCategoria(noMes(estado.movimentacoes, ym)),
            receitas: somaReceitas(noMes(estado.movimentacoes, ym)),
            despesas: somaDespesas(noMes(estado.movimentacoes, ym)),
            faturas: estado.faturas.filter((f) => f.status !== 'paga'),
            metas: estado.metas,
          },
        }),
      });
      if (resp.ok) return (await resp.json()) as Resposta;
    } catch {
      /* cai para o motor local abaixo */
    }
  }
  await new Promise((r) => setTimeout(r, 420 + Math.random() * 500));
  return responderLocal(pergunta, estado, ym);
}
