import type { ContextoConversa, EstadoApp, MemoriaAssistente, PreferenciaAprendida } from '@/types';
import { brl, dataBR, diasAte, mesAnterior, mesAtual, mesDe, num, rotuloMes, uid, MESES_LONGOS } from './format';
import {
  despesas as somaDespesas, noMes, orcamentoVsReal, patrimonio, porCategoria,
  proximoVencimento, receitas as somaReceitas, resumoMes, saldoAte,
} from './finance';
import { nomesCategorias, normalizar } from './categorias';
import { simular } from './simulador';
import { taxasAtuais } from './taxas';
import { IA_CONFIGURADA, IA_ENDPOINT } from './documentos';

/**
 * Assistente contAI — motor local.
 *
 * Todos os números são CALCULADOS a partir dos registros do aplicativo (nunca
 * gerados por um modelo). Cada resposta informa de onde vêm os valores.
 * A memória (preferências, regras aprendidas, contexto da última pergunta) fica
 * no IndexedDB; o histórico da conversa não dá acesso automático aos dados —
 * cada pergunta consulta só os registros de que precisa.
 */

export interface Resposta {
  texto: string;
  detalhe?: string;
  sugestoes?: string[];
  /** Atualizações de memória decorrentes desta resposta. */
  memoria?: Partial<MemoriaAssistente>;
  /** Efeitos colaterais confirmados pelo usuário na própria mensagem. */
  efeitos?: Array<
    | { t: 'regra'; padrao: string; categoria: string }
    | { t: 'categoria'; nome: string; tipo: 'receita' | 'despesa' }
  >;
}

export const SUGESTOES_INICIAIS = [
  'Quanto gastei com alimentação este mês?',
  'Quais despesas aumentaram?',
  'Quanto posso gastar até o final do mês?',
  'Quais contas vencem esta semana?',
  'Quanto preciso guardar para atingir minha meta?',
  'Quais assinaturas estão pesando no meu orçamento?',
  'Como está minha situação financeira?',
  'Quanto meu dinheiro poderia render investido?',
];

type Intencao =
  | 'gasto_categoria' | 'vencimentos' | 'disponivel' | 'aumentos' | 'assinaturas'
  | 'metas' | 'simulacao' | 'patrimonio' | 'maiores' | 'situacao' | 'receitas';

/* ------------------------- período em linguagem natural ------------------------- */
function periodoDaPergunta(p: string, ym: string): { ym: string; explicito: boolean } {
  const atual = mesAtual();
  if (/(mes passado|mes anterior|ultimo mes)/.test(p)) return { ym: mesAnterior(atual), explicito: true };
  if (/(este mes|esse mes|neste mes|nesse mes|mes atual)/.test(p)) return { ym: atual, explicito: true };
  const idx = MESES_LONGOS.findIndex((m) => new RegExp(`\\b${normalizar(m)}\\b`).test(p));
  if (idx >= 0) {
    const anoTxt = p.match(/\b(20\d{2})\b/);
    const hoje = new Date();
    let ano = anoTxt ? Number(anoTxt[1]) : hoje.getFullYear();
    if (!anoTxt && idx > hoje.getMonth()) ano -= 1; // "em dezembro" falado em outubro = dezembro passado
    return { ym: `${ano}-${String(idx + 1).padStart(2, '0')}`, explicito: true };
  }
  return { ym, explicito: false };
}

function detectarIntencao(p: string): Intencao | null {
  if (/(vence|vencimento|contas? a pagar|pagar.*semana|boleto|a vencer)/.test(p)) return 'vencimentos';
  if (/(posso gastar|quanto sobra|sobrou|ate o final do mes|disponivel para gastar|limite de gasto)/.test(p)) return 'disponivel';
  if (/(aument|subiu|subiram|cresceu|cresceram|piorou|comparad|comparar|variacao)/.test(p)) return 'aumentos';
  if (/(assinatura|recorrente|mensalidade|streaming)/.test(p)) return 'assinaturas';
  if (/(meta|guardar|economizar|objetivo|juntar|poupar)/.test(p)) return 'metas';
  if (/(render|investir|investido|aplicar|cdi|selic|rendimento|rentabilidade)/.test(p) && !/(quanto tenho investido|minha carteira)/.test(p)) return 'simulacao';
  if (/(patrimonio|carteira|quanto tenho investido|meus investimentos)/.test(p)) return 'patrimonio';
  if (/(maior|maiores|top|onde mais gastei|mais gastei|principais gastos)/.test(p)) return 'maiores';
  if (/(recebi|receitas?|ganhei|entrou|entradas)/.test(p)) return 'receitas';
  if (/(situacao|como estou|resumo|saldo|panorama|financeira|como estao minhas)/.test(p)) return 'situacao';
  if (/(gast|despes|paguei|quanto foi)/.test(p)) return 'gasto_categoria';
  return null;
}

/** Perguntas curtas de continuação: "e no mês passado?", "e transporte?" */
const ehContinuacao = (p: string) => /^(e |e\?|e no|e na|e em|e com|e o |e a |e os |e as |no mes|em |e quanto)/.test(p.trim()) || p.trim().split(/\s+/).length <= 3;

/* ------------------------------- memória ------------------------------- */
function comandoDeMemoria(pergunta: string, p: string, estado: EstadoApp): Resposta | null {
  const mem = estado.memoria;

  const lembrar = pergunta.match(/^\s*(?:por favor,?\s*)?(?:lembre(?:-se)?|lembra|anote|guarde|memorize|grave)\s+(?:que|de que|disso:?|isso:?)?\s*(.{3,})$/i)
    ?? pergunta.match(/^\s*((?:eu\s+)?prefiro\s+.{3,}|minha preferencia e\s+.{3,}|minha preferência é\s+.{3,})$/i);
  if (lembrar) {
    const texto = lembrar[1].trim().replace(/[.!]+$/, '');
    const nova: PreferenciaAprendida = { id: uid(), texto, em: new Date().toISOString() };
    return {
      texto: `Anotado: “${texto}”. Vou considerar isso nas próximas conversas, mesmo depois de fechar o app.`,
      detalhe: 'Guardado na memória local do assistente (IndexedDB deste navegador). Para apagar: Configurações › Memória do assistente, ou diga “esqueça …”.',
      memoria: { preferencias: [...mem.preferencias, nova] },
    };
  }

  const esquecer = p.match(/^\s*(?:esqueca|esquecer|apague|remova)\s+(?:que\s+|de que\s+)?(.+)$/);
  if (esquecer) {
    const alvo = esquecer[1].replace(/[.!?]+$/, '').trim();
    if (/^(tudo|todas as preferencias|o que te disse)$/.test(alvo)) {
      return { texto: `Pronto, esqueci ${mem.preferencias.length} preferência(s) anotada(s). As regras de classificação continuam — elas podem ser apagadas em Configurações.`, memoria: { preferencias: [] } };
    }
    const restantes = mem.preferencias.filter((x) => !normalizar(x.texto).includes(alvo));
    const removidas = mem.preferencias.length - restantes.length;
    return removidas
      ? { texto: `Removi ${removidas} anotação(ões) que mencionavam “${alvo}”.`, memoria: { preferencias: restantes } }
      : { texto: `Não encontrei nenhuma anotação com “${alvo}”. Diga “o que você lembra sobre mim?” para ver a lista.` };
  }

  if (/(o que voce lembra|o que voce sabe sobre mim|minhas preferencias|sua memoria|o que voce aprendeu)/.test(p)) {
    const prefs = mem.preferencias.map((x) => `• ${x.texto} (${dataBR(x.em)})`);
    const regras = estado.regras.slice(-6).map((r) => `• “${r.padrao}” → ${r.categoria}`);
    return {
      texto:
        (prefs.length ? `Preferências que você me pediu para lembrar:\n${prefs.join('\n')}` : 'Você ainda não me pediu para lembrar de nenhuma preferência.') +
        (regras.length ? `\n\nRegras de classificação aprendidas (${estado.regras.length}):\n${regras.join('\n')}` : '\n\nAinda não aprendi regras de classificação.') +
        (estado.correcoes.length ? `\n\nVocê corrigiu ${estado.correcoes.length} classificação(ões) até agora.` : ''),
      detalhe: 'Memória local: preferências, regras, correções e o contexto da última pergunta. O histórico de conversa não dá acesso automático aos seus dados financeiros.',
    };
  }

  const ensinar = pergunta.match(/(?:classifique|categorize|coloque|considere)\s+["“]?(.+?)["”]?\s+(?:sempre\s+)?(?:como|em|na categoria)\s+["“]?([^"”]+?)["”]?[.!]?$/i);
  if (ensinar) {
    const padrao = normalizar(ensinar[1]).trim();
    const pedido = normalizar(ensinar[2]).trim();
    const categoria = nomesCategorias(estado.categorias).find((c) => normalizar(c) === pedido);
    if (!categoria) {
      return {
        texto: `Não encontrei a categoria “${ensinar[2]}”. Quer que eu crie? Responda “crie a categoria ${ensinar[2]}”, ou escolha uma existente: ${nomesCategorias(estado.categorias, 'despesa').slice(0, 8).join(', ')}…`,
      };
    }
    return {
      texto: `Combinado: lançamentos com “${padrao}” serão sugeridos como ${categoria} nas próximas importações.`,
      detalhe: 'Regra salva em Configurações › Categorias e regras.',
      efeitos: [{ t: 'regra', padrao, categoria }],
    };
  }

  const criar = pergunta.match(/cri(?:e|ar)\s+(?:a\s+|uma\s+)?categoria\s+(?:de\s+)?["“]?([^"”]+?)["”]?(?:\s+(?:de|para)\s+(receita|despesa)s?)?[.!]?$/i);
  if (criar) {
    const nome = criar[1].trim().replace(/^\w/, (c) => c.toUpperCase());
    const tipo = (criar[2]?.toLowerCase() as 'receita' | 'despesa' | undefined) ?? 'despesa';
    return { texto: `Criei a categoria “${nome}” (${tipo}). Ela já aparece nos formulários e na revisão de faturas.`, efeitos: [{ t: 'categoria', nome, tipo }] };
  }

  return null;
}

/** Preferências anotadas que têm palavras em comum com a pergunta. */
function lembrancasRelevantes(p: string, mem: MemoriaAssistente) {
  const palavras = new Set(p.split(/\W+/).filter((w) => w.length > 4));
  return mem.preferencias.filter((x) => normalizar(x.texto).split(/\W+/).some((w) => w.length > 4 && palavras.has(w)));
}

/* ------------------------------- respostas ------------------------------- */
export function responderLocal(pergunta: string, estado: EstadoApp, ymPadrao: string): Resposta {
  const p = normalizar(pergunta);

  const cmd = comandoDeMemoria(pergunta, p, estado);
  if (cmd) return cmd;

  if (!estado.prefs.consentimentoIA) {
    return {
      texto:
        'Para responder com base nos seus registros financeiros, preciso da sua autorização. ' +
        'Ative em Configurações › Privacidade (“Permitir que o assistente consulte meus registros”). Você pode revogar quando quiser.',
      detalhe: 'Nenhum dado financeiro foi consultado nesta resposta.',
    };
  }

  // Intenção: a da pergunta, ou a da conversa anterior quando for uma continuação
  const ctxAnterior = estado.memoria.contexto;
  let intencao = detectarIntencao(p);
  const categoriaNaPergunta = nomesCategorias(estado.categorias).find((c) => new RegExp(`\\b${normalizar(c)}\\b`).test(p));
  let usouContexto = false;
  if ((!intencao || (intencao === 'gasto_categoria' && !categoriaNaPergunta && ctxAnterior?.categoria)) && ctxAnterior && ehContinuacao(p)) {
    intencao = (intencao ?? ctxAnterior.intencao) as Intencao;
    usouContexto = true;
  }
  if (!intencao && categoriaNaPergunta) intencao = 'gasto_categoria';

  const periodo = periodoDaPergunta(p, usouContexto && ctxAnterior ? ctxAnterior.periodo : ymPadrao);
  const ym = periodo.ym;
  const categoria = categoriaNaPergunta ?? (usouContexto ? ctxAnterior?.categoria : undefined);
  const contexto: ContextoConversa | undefined = intencao ? { intencao, periodo: ym, categoria, em: new Date().toISOString() } : undefined;

  if (!estado.movimentacoes.length && !estado.faturas.length && !estado.investimentos.length && !estado.metas.length) {
    return {
      texto:
        'Ainda não há registros no contAI, então não tenho base para calcular. Cadastre uma receita ou despesa, envie uma fatura ' +
        'ou carregue os dados de demonstração no Início. Assim que houver dados, eu respondo com os números e explico de onde vieram.',
      sugestoes: ['O que você lembra sobre mim?'],
    };
  }

  const movsMes = noMes(estado.movimentacoes, ym);
  const resumo = resumoMes(estado, ym);
  const fonte = `Fonte: ${movsMes.length} movimentação(ões) registradas em ${rotuloMes(ym)}${estado.movimentacoes.some((m) => m.demo) ? ' (inclui dados de demonstração fictícios)' : ''}.`;
  const lembrancas = lembrancasRelevantes(p, estado.memoria);
  const notaMemoria = lembrancas.length ? `\n\nLembrando o que você me disse: ${lembrancas.map((l) => `“${l.texto}”`).join('; ')}.` : '';
  const out = (r: Resposta): Resposta => ({ ...r, texto: r.texto + notaMemoria, memoria: contexto ? { ...r.memoria, contexto } : r.memoria });

  switch (intencao) {
    case 'gasto_categoria': {
      if (!categoria) {
        return out({
          texto: `Em ${rotuloMes(ym)} suas despesas somam ${brl(resumo.despesas)} em ${movsMes.filter((m) => m.tipo === 'despesa').length} lançamento(s). Sobre qual categoria você quer saber?`,
          detalhe: fonte,
          sugestoes: porCategoria(movsMes).slice(0, 4).map((c) => `E com ${c.categoria.toLowerCase()}?`),
        });
      }
      const alvo = normalizar(categoria);
      const doMes = movsMes.filter((m) => m.tipo === 'despesa' && normalizar(m.categoria) === alvo);
      const total = somaDespesas(doMes);
      const totalAnt = somaDespesas(noMes(estado.movimentacoes, mesAnterior(ym)).filter((m) => normalizar(m.categoria) === alvo));
      const share = resumo.despesas ? (total / resumo.despesas) * 100 : 0;
      if (!doMes.length) {
        return out({ texto: `Não encontrei despesas de ${categoria} em ${rotuloMes(ym)}.`, detalhe: fonte, sugestoes: ['E no mês passado?'] });
      }
      const dif = totalAnt ? ((total - totalAnt) / totalAnt) * 100 : null;
      return out({
        texto:
          `Você gastou ${brl(total)} com ${categoria} em ${rotuloMes(ym)}, o que representa ${num(share, 1)}% do seu total de despesas (${brl(resumo.despesas)}).` +
          (dif === null ? '' : ` Em relação a ${rotuloMes(mesAnterior(ym))} (${brl(totalAnt)}), houve ${dif >= 0 ? 'aumento' : 'redução'} de ${num(Math.abs(dif), 0)}%.`) +
          `\n\nEsse valor vem destas movimentações:\n${doMes.slice(0, 6).map((m) => `• ${m.descricao}: ${brl(m.valor)}`).join('\n')}${doMes.length > 6 ? `\n• …e mais ${doMes.length - 6}` : ''}`,
        detalhe: `${fonte} Soma das despesas com categoria “${categoria}” no período.`,
        sugestoes: ['E no mês passado?', 'Quais despesas aumentaram?', 'Quanto posso gastar até o final do mês?'],
      });
    }

    case 'receitas': {
      const rec = movsMes.filter((m) => m.tipo === 'receita');
      return out({
        texto: rec.length
          ? `Em ${rotuloMes(ym)} entraram ${brl(resumo.receitas)}:\n${porCategoria(movsMes, 'receita').map((c) => `• ${c.categoria}: ${brl(c.valor)}`).join('\n')}`
          : `Não há receitas registradas em ${rotuloMes(ym)}.`,
        detalhe: fonte,
        sugestoes: ['Como está minha situação financeira?'],
      });
    }

    case 'vencimentos': {
      const janela = /semana/.test(p) ? 7 : /hoje/.test(p) ? 0 : 30;
      const contas = estado.faturas
        .filter((f) => f.status !== 'paga')
        .map((f) => ({ nome: f.referencia, valor: f.valor, venc: f.vencimento, d: diasAte(f.vencimento), origem: 'fatura' }));
      const recorrentes = estado.recorrentes
        .filter((r) => r.ativo && r.tipo === 'despesa')
        .map((r) => { const venc = proximoVencimento(r.diaVencimento); return { nome: r.descricao, valor: r.valor, venc, d: diasAte(venc), origem: 'recorrente' }; });
      const lista = [...contas, ...recorrentes].filter((x) => x.d >= -15 && x.d <= janela).sort((a, b) => a.d - b.d);
      if (!lista.length) {
        return out({ texto: `Nenhuma conta em aberto vence ${janela === 7 ? 'nesta semana' : janela === 0 ? 'hoje' : 'nos próximos 30 dias'}.`, detalhe: `Fonte: ${estado.faturas.length} fatura(s)/conta(s) e ${estado.recorrentes.length} recorrente(s) cadastradas.` });
      }
      const total = lista.reduce((t, x) => t + x.valor, 0);
      return out({
        texto:
          `${lista.length === 1 ? 'Encontrei 1 conta' : `Encontrei ${lista.length} contas`} ${janela === 7 ? 'para esta semana' : 'no período'}, somando ${brl(total)}:\n` +
          lista.map((x) => `• ${x.nome} — ${brl(x.valor)} — ${dataBR(x.venc)}${x.d < 0 ? ` (vencida há ${Math.abs(x.d)} dia(s))` : x.d === 0 ? ' (hoje)' : ` (em ${x.d} dia(s))`}${x.origem === 'recorrente' ? ' · recorrente' : ''}`).join('\n'),
        detalhe: 'Fonte: faturas e contas não pagas (tela Faturas) e contas recorrentes ativas (Planejamento), pela próxima data de vencimento.',
        sugestoes: ['Quanto posso gastar até o final do mês?'],
      });
    }

    case 'disponivel': {
      const hoje = new Date();
      const ultimoDia = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
      const mesCorrente = mesAtual() === ym;
      const diasRestantes = mesCorrente ? Math.max(0, ultimoDia - hoje.getDate()) : 0;
      const contasAbertas = estado.faturas.filter((f) => f.status !== 'paga' && mesDe(f.vencimento) === ym).reduce((t, f) => t + f.valor, 0);
      const recorrentesPendentes = mesCorrente
        ? estado.recorrentes.filter((r) => r.ativo && r.tipo === 'despesa' && r.diaVencimento > hoje.getDate()).reduce((t, r) => t + r.valor, 0)
        : 0;
      const disponivel = resumo.liquido - contasAbertas - recorrentesPendentes;
      return out({
        texto:
          `Em ${rotuloMes(ym)} você recebeu ${brl(resumo.receitas)} e gastou ${brl(resumo.despesas)} (resultado de ${brl(resumo.liquido)}).` +
          (contasAbertas ? ` Ainda há ${brl(contasAbertas)} em contas abertas que vencem neste mês.` : '') +
          (recorrentesPendentes ? ` As recorrentes que ainda vão vencer somam ${brl(recorrentesPendentes)}.` : '') +
          `\n\nDescontando isso, sobram ${brl(disponivel)}` +
          (diasRestantes > 0 && disponivel > 0 ? ` — cerca de ${brl(disponivel / diasRestantes)} por dia nos ${diasRestantes} dias restantes.` : '.') +
          (disponivel < 0 ? '\n\nO valor ficou negativo: os compromissos do mês superam o que entrou. Vale olhar as maiores despesas.' : ''),
        detalhe: `${fonte} Cálculo: receitas − despesas − contas abertas do mês − recorrentes ainda não vencidas. Não considera saldo de meses anteriores.`,
        sugestoes: ['Quais são meus maiores gastos?', 'Quais assinaturas estão pesando no meu orçamento?'],
      });
    }

    case 'aumentos': {
      const atual = porCategoria(movsMes);
      const mapaAnt = new Map(porCategoria(noMes(estado.movimentacoes, mesAnterior(ym))).map((c) => [c.categoria, c.valor]));
      const difs = atual
        .map((c) => ({ ...c, antes: mapaAnt.get(c.categoria) ?? 0 }))
        .map((c) => ({ ...c, dif: c.valor - c.antes }))
        .filter((c) => c.dif > 0.009)
        .sort((a, b) => b.dif - a.dif)
        .slice(0, 5);
      if (!mapaAnt.size) return out({ texto: `Não há despesas em ${rotuloMes(mesAnterior(ym))} para comparar com ${rotuloMes(ym)}.`, detalhe: fonte });
      if (!difs.length) return out({ texto: `Nenhuma categoria de despesa aumentou em ${rotuloMes(ym)} na comparação com ${rotuloMes(mesAnterior(ym))}.`, detalhe: fonte });
      return out({
        texto:
          `Categorias que subiram em ${rotuloMes(ym)} em relação a ${rotuloMes(mesAnterior(ym))}:\n` +
          difs.map((c) => `• ${c.categoria}: ${brl(c.antes)} → ${brl(c.valor)} (+${brl(c.dif)}${c.antes ? `, +${num((c.dif / c.antes) * 100, 0)}%` : ', nova no mês'})`).join('\n'),
        detalhe: 'Comparação das despesas por categoria entre os dois meses, a partir das movimentações registradas.',
        sugestoes: difs[0] ? [`Quanto gastei com ${difs[0].categoria.toLowerCase()}?`] : undefined,
      });
    }

    case 'assinaturas': {
      const ass = movsMes.filter((m) => m.tipo === 'despesa' && normalizar(m.categoria) === 'assinaturas');
      const recorrentes = estado.recorrentes.filter((r) => r.ativo && r.tipo === 'despesa');
      if (!ass.length && !recorrentes.length) return out({ texto: 'Não encontrei assinaturas lançadas nem contas recorrentes cadastradas.', detalhe: fonte });
      const totalAss = somaDespesas(ass);
      const totalRec = recorrentes.reduce((t, r) => t + r.valor, 0);
      const pctReceita = resumo.receitas ? (totalAss / resumo.receitas) * 100 : null;
      return out({
        texto:
          (ass.length
            ? `Assinaturas lançadas em ${rotuloMes(ym)}: ${brl(totalAss)} (${num(resumo.despesas ? (totalAss / resumo.despesas) * 100 : 0, 1)}% das despesas${pctReceita !== null ? `, ${num(pctReceita, 1)}% das receitas` : ''}).\n` +
              [...ass].sort((a, b) => b.valor - a.valor).map((m) => `• ${m.descricao}: ${brl(m.valor)} (≈ ${brl(m.valor * 12)}/ano)`).join('\n')
            : `Nenhuma despesa na categoria Assinaturas em ${rotuloMes(ym)}.`) +
          (recorrentes.length ? `\n\nSuas contas recorrentes cadastradas somam ${brl(totalRec)} por mês (${brl(totalRec * 12)} por ano).` : ''),
        detalhe: 'Fonte: movimentações da categoria Assinaturas no período + contas recorrentes ativas do Planejamento.',
      });
    }

    case 'metas': {
      if (!estado.metas.length) {
        return out({ texto: 'Você ainda não criou metas. Em Planejamento › Metas dá para definir o objetivo, o valor e o prazo — aí eu calculo quanto guardar por mês.' });
      }
      const nomeAlvo = estado.metas.find((m) => p.includes(normalizar(m.nome)));
      const metas = nomeAlvo ? [nomeAlvo] : estado.metas;
      const mediaResultado = [0, 1, 2].map((i) => resumoMes(estado, mesAnteriorN(ym, i)).liquido);
      const media = mediaResultado.reduce((a, b) => a + b, 0) / 3;
      const linhas = metas.map((m) => {
        const falta = Math.max(0, m.alvo - m.atual);
        const mesesRest = Math.max(1, Math.ceil(diasAte(m.prazo) / 30.4375));
        if (falta === 0) return `• ${m.nome}: concluída (${brl(m.atual)}).`;
        if (diasAte(m.prazo) < 0) return `• ${m.nome}: faltam ${brl(falta)} e o prazo (${dataBR(m.prazo)}) já passou. Quer definir um novo prazo?`;
        return `• ${m.nome}: ${brl(m.atual)} de ${brl(m.alvo)} (${num((m.atual / m.alvo) * 100, 0)}%). Faltam ${brl(falta)} — cerca de ${brl(falta / mesesRest)} por mês nos ${mesesRest} meses até ${dataBR(m.prazo)}.`;
      });
      return out({
        texto: `${nomeAlvo ? 'Sua meta' : 'Suas metas'}:\n${linhas.join('\n')}\n\nNos últimos 3 meses seu resultado médio (receitas − despesas) foi de ${brl(media)} por mês.`,
        detalhe: 'Cálculo: (valor alvo − valor já guardado) ÷ meses restantes até o prazo. Não considera rendimento do valor guardado.',
        sugestoes: ['Quanto meu dinheiro poderia render investido?'],
      });
    }

    case 'simulacao': {
      const taxas = taxasAtuais(estado.prefs);
      const valorTexto = extrairValor(pergunta);
      const meses = extrairMeses(p) ?? 12;
      const percentual = extrairPercentualCDI(p) ?? 100;
      const valor = valorTexto ?? (resumo.liquido > 0 ? Math.round(resumo.liquido * 100) / 100 : null);
      if (!valor) {
        return out({
          texto: 'Qual valor você quer simular? Por exemplo: “Quanto R$ 5.000 renderiam em 12 meses a 100% do CDI?”',
          sugestoes: ['Quanto R$ 5.000 renderiam em 12 meses a 100% do CDI?', 'Abrir o simulador completo'],
        });
      }
      const r = simular({ indexador: 'CDI', valorInicial: valor, aporteMensal: 0, meses, taxaAnual: 0, percentualIndexador: percentual, isentoIR: false, taxaCustodiaAnual: 0 }, taxas);
      return out({
        texto:
          (valorTexto ? '' : `Você não informou um valor, então usei o resultado de ${rotuloMes(ym)} (${brl(valor)}) como exemplo.\n\n`) +
          `A ${num(percentual, 0)}% do CDI (${num(taxas.CDI.valor, 2)}% a.a.), ${brl(valor)} por ${meses} meses chegariam a cerca de ${brl(r.patrimonioFinal)} líquidos:\n` +
          `• Rendimento bruto: ${brl(r.rendimentoBruto)}\n• IR estimado (${num(r.aliquotaIR, 1)}%): ${brl(r.impostoIR)}\n• Rendimento líquido: ${brl(r.rendimentoLiquido)}`,
        detalhe:
          `Taxa: ${taxas.CDI.fonte}, dado de ${dataBR(taxas.CDI.data)}${taxas.CDI.origem === 'referencia' ? ' (valor armazenado no app — ilustrativo)' : ''}. ` +
          'Taxa constante, sem aportes nem resgates. Projeção não garante rentabilidade futura e não é recomendação de investimento.',
        sugestoes: ['Abrir o simulador completo'],
      });
    }

    case 'patrimonio': {
      const pat = patrimonio(estado);
      if (!pat.total) return out({ texto: 'Não há investimentos cadastrados. Você pode cadastrá-los manualmente em Investimentos.', detalhe: 'O contAI não tem integração com corretoras.' });
      return out({
        texto:
          `Seu patrimônio investido cadastrado é de ${brl(pat.total)}, com rentabilidade acumulada informada de ${num(pat.rentabilidadeMedia, 2)}% em média (≈ ${brl(pat.rendimento)}).\n` +
          pat.distribuicao.map((d) => `• ${d.modalidade}: ${brl(d.valor)} (${num(d.pct, 0)}%)`).join('\n'),
        detalhe: 'Fonte: ativos cadastrados manualmente em Investimentos. A rentabilidade é a informada por você; não há cotação em tempo real.',
      });
    }

    case 'maiores': {
      const top = movsMes.filter((m) => m.tipo === 'despesa').sort((a, b) => b.valor - a.valor).slice(0, 5);
      if (!top.length) return out({ texto: `Não há despesas em ${rotuloMes(ym)}.`, detalhe: fonte });
      return out({
        texto: `Maiores despesas de ${rotuloMes(ym)}:\n${top.map((m, i) => `${i + 1}. ${m.descricao} — ${brl(m.valor)} (${m.categoria}, ${dataBR(m.data)})`).join('\n')}`,
        detalhe: fonte,
      });
    }

    case 'situacao': {
      const orc = orcamentoVsReal(estado, ym).filter((o) => o.pct > 100);
      const pat = patrimonio(estado);
      const v = (x: number | null) => (x === null ? 'sem base de comparação' : `${x >= 0 ? '+' : ''}${num(x, 0)}% vs. mês anterior`);
      const poupanca = resumo.receitas ? (resumo.liquido / resumo.receitas) * 100 : null;
      return out({
        texto:
          `Panorama de ${rotuloMes(ym)}:\n` +
          `• Saldo acumulado nas contas: ${brl(saldoAte(estado, ym))}\n` +
          `• Receitas: ${brl(resumo.receitas)} (${v(resumo.receitasVar)})\n` +
          `• Despesas: ${brl(resumo.despesas)} (${v(resumo.despesasVar)})\n` +
          `• Resultado do mês: ${brl(resumo.liquido)}${poupanca !== null ? ` (${num(poupanca, 0)}% do que entrou)` : ''}\n` +
          `• Contas em aberto: ${brl(resumo.pendentesValor)} em ${resumo.pendentesQtd} documento(s)\n` +
          `• Investimentos cadastrados: ${brl(pat.total)}\n` +
          (orc.length
            ? `\nOrçamento ultrapassado em: ${orc.map((o) => `${o.categoria} (${num(o.pct, 0)}% do limite)`).join(', ')}.`
            : estado.orcamentos.length ? '\nNenhuma categoria passou do limite planejado.' : '\nVocê ainda não definiu limites por categoria em Planejamento.'),
        detalhe: `${fonte} Saldo = saldo inicial das contas + receitas − despesas acumuladas até o fim do mês.`,
        sugestoes: ['Quais despesas aumentaram?', 'Quanto posso gastar até o final do mês?'],
      });
    }

    default:
      return {
        texto:
          'Não entendi o que você quer saber e prefiro não chutar números. Consigo responder sobre gastos por categoria, ' +
          'receitas, comparação entre meses, contas a vencer, quanto sobra no mês, metas, assinaturas, patrimônio e simulações de rendimento. ' +
          'Também posso lembrar preferências (“lembre que…”) e aprender classificações (“classifique X como Lazer”).\n\nSobre qual desses assuntos você quer falar?',
        detalhe: `Dados disponíveis: ${estado.movimentacoes.length} movimentações, ${estado.faturas.length} faturas, ${estado.investimentos.length} investimentos, ${estado.metas.length} metas.`,
        sugestoes: SUGESTOES_INICIAIS.slice(0, 4),
      };
  }
}

const mesAnteriorN = (ym: string, n: number) => { let r = ym; for (let i = 0; i < n; i++) r = mesAnterior(r); return r; };

/* ---------- extratores de parâmetros do texto ---------- */
function extrairValor(texto: string): number | null {
  const m = texto.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i) ?? texto.match(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,}(?:,\d{1,2})?)\b(?!\s*(?:%|mes|meses|ano|anos|dias))/i);
  if (!m) return null;
  const mil = /\bmil\b/i.test(texto.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 5));
  const v = Number(m[1].replace(/\./g, '').replace(',', '.')) * (mil ? 1000 : 1);
  return Number.isFinite(v) && v > 0 ? v : null;
}
function extrairMeses(p: string): number | null {
  const m = p.match(/(\d{1,3})\s*(mes|meses)\b/);
  if (m) return Math.min(600, Number(m[1]));
  const a = p.match(/(\d{1,2})\s*(ano|anos)\b/);
  if (a) return Number(a[1]) * 12;
  if (/\bum ano\b/.test(p)) return 12;
  return null;
}
function extrairPercentualCDI(p: string): number | null {
  const m = p.match(/(\d{2,3}(?:[.,]\d+)?)\s*%\s*(do\s*)?cdi/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/**
 * Usa o backend de IA quando configurado E autorizado para envio externo;
 * caso contrário, o motor local. O backend recebe apenas o resumo calculado
 * localmente — os números continuam vindo do contAI, não do modelo.
 */
export async function perguntar(pergunta: string, estado: EstadoApp, ym: string): Promise<Resposta & { externo: boolean }> {
  const local = responderLocal(pergunta, estado, ym);
  if (IA_CONFIGURADA && estado.prefs.consentimentoIA && estado.prefs.consentimentoEnvioExterno) {
    try {
      const movs = noMes(estado.movimentacoes, ym);
      const resp = await fetch(`${IA_ENDPOINT}/assistente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pergunta,
          periodo: ym,
          respostaCalculada: local,
          preferencias: estado.memoria.preferencias.map((x) => x.texto),
          historico: estado.conversas.slice(-8).map((m) => ({ autor: m.autor, texto: m.texto })),
          contexto: {
            resumo: resumoMes(estado, ym),
            categorias: porCategoria(movs),
            receitas: somaReceitas(movs),
            despesas: somaDespesas(movs),
          },
        }),
      });
      if (resp.ok) {
        const r = (await resp.json()) as Partial<Resposta>;
        if (r.texto) return { ...local, texto: r.texto, detalhe: r.detalhe ?? local.detalhe, externo: true };
      }
    } catch {
      /* cai para a resposta local abaixo */
    }
  }
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 350));
  return { ...local, externo: false };
}
