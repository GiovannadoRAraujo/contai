import type { DocumentoAnalisado, TipoMov, TransacaoExtraida } from '@/types';
import { classificar, detectarParcela, LIMITE_CONFIANCA } from '@/lib/classificador';
import { normalizar } from '@/lib/categorias';
import { hashMov } from '@/lib/finance';
import { uid } from '@/lib/format';

/**
 * Interpretação do texto de um documento financeiro (fatura, extrato, conta,
 * comprovante), já extraído por pdf.js, OCR local ou serviço externo.
 *
 * Princípio: só registra o que está no texto. Valores, datas e descrições que
 * não forem encontrados ficam ausentes — nada é completado por suposição. Linhas
 * ambíguas viram dúvidas para o usuário responder na revisão.
 */

export interface ResultadoInterpretacao {
  documento: DocumentoAnalisado['documento'];
  emissor?: string;
  totalDocumento?: number;
  vencimento?: string;
  linhaDigitavel?: string;
  transacoes: TransacaoExtraida[];
  avisos: string[];
}

export interface OpcoesInterpretacao {
  hoje?: Date;
  regras?: Record<string, string>;
  /** Hashes de movimentações já existentes (detecção de duplicidade). */
  existentes?: Set<string>;
}

const MESES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const EMISSORES: Array<[RegExp, string]> = [
  [/\bnubank\b|\bnu pagamentos\b/, 'Nubank'],
  [/\bitau\b|\bitaucard\b/, 'Itaú'],
  [/\bbradesco\b/, 'Bradesco'],
  [/\bbanco do brasil\b|\bourocard\b/, 'Banco do Brasil'],
  [/\bcaixa economica\b|\bcaixa\b/, 'Caixa'],
  [/\bsantander\b/, 'Santander'],
  [/\bbanco inter\b|\binter\b/, 'Inter'],
  [/\bc6 ?bank\b|\bc6\b/, 'C6 Bank'],
  [/\bbtg\b/, 'BTG Pactual'],
  [/\bpicpay\b/, 'PicPay'],
  [/\bmercado pago\b/, 'Mercado Pago'],
  [/\bsicoob\b/, 'Sicoob'],
  [/\bsicredi\b/, 'Sicredi'],
  [/\bneon\b/, 'Neon'],
  [/\benel\b/, 'Enel'],
  [/\blight\b/, 'Light'],
  [/\bcemig\b/, 'Cemig'],
  [/\bcopel\b/, 'Copel'],
  [/\bsabesp\b/, 'Sabesp'],
  [/\bcomgas\b/, 'Comgás'],
  [/\bvivo\b|\btelefonica\b/, 'Vivo'],
  [/\bclaro\b/, 'Claro'],
  [/\btim\b/, 'TIM'],
];

const RE_VALOR = /(?:^|[\s(])([-+−]?)\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?:\s*([-+−]|\bC\b|\bD\b))?(?=[\s)]|$)/gi;
const RE_DATA_INICIO = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/;
const RE_DATA_MES_TEXTO = /^(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s*(?:de\s+)?(\d{4}))?\b/i;
const RE_DATA_COMPLETA = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/;

/** Termos que indicam linhas de resumo — não são transações. */
const RESUMO = [
  'total', 'subtotal', 'saldo anterior', 'saldo atual', 'saldo final', 'saldo do dia', 'saldo disponivel',
  'limite', 'vencimento', 'pagamento minimo', 'valor minimo', 'encargos', 'juros do rotativo',
  'proxima fatura', 'melhor dia', 'fechamento', 'cet ', 'taxa de juros', 'parcelamento da fatura',
];

const PAGAMENTO_FATURA = ['pagamento recebido', 'pagamento de fatura', 'pgto fatura', 'pagamento efetuado', 'pagto fatura', 'pagamento obrigado', 'pagamento - obrigado'];
const ESTORNO = ['estorno', 'devolucao', 'reembolso', 'credito de', 'ajuste a credito', 'cashback', 'chargeback'];
const RECEITA = ['salario', 'pix recebido', 'ted recebida', 'transferencia recebida', 'deposito', 'rendimento', 'credito em conta', 'recebimento'];
const TRANSFERENCIA = ['pix enviado', 'pix transf', 'transferencia enviada', 'ted enviada', 'doc enviado', 'transf ', 'pix '];
const TARIFA = ['iof', 'tarifa', 'anuidade', 'juros', 'multa', 'encargo'];

const contem = (txt: string, termos: string[]) => termos.some((t) => txt.includes(t));

export function parseValorBR(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function dataValida(a: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return false;
  const dt = new Date(a, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Ano de 2 dígitos -> 4 dígitos. */
const ano4 = (a: string) => (a.length === 2 ? 2000 + Number(a) : Number(a));

/** Data completa em qualquer posição da linha (dd/mm/aaaa). */
function acharDataCompleta(linha: string): string | undefined {
  const m = linha.match(RE_DATA_COMPLETA);
  if (!m) return undefined;
  const a = ano4(m[3]);
  const mes = Number(m[2]);
  const d = Number(m[1]);
  return dataValida(a, mes, d) ? iso(a, mes, d) : undefined;
}

/**
 * Data no início da linha. Sem ano, usa a referência: transações de fatura
 * acontecem antes do vencimento, então um mês posterior ao de referência
 * pertence ao ano anterior.
 */
function dataNoInicio(linha: string, ref: Date): { data: string; resto: string; inferiuAno: boolean } | null {
  let dia: number; let mes: number; let ano: number | undefined; let resto: string;
  const m1 = linha.match(RE_DATA_INICIO);
  const m2 = m1 ? null : linha.match(RE_DATA_MES_TEXTO);
  if (m1) {
    dia = Number(m1[1]); mes = Number(m1[2]); ano = m1[3] ? ano4(m1[3]) : undefined;
    resto = linha.slice(m1[0].length);
  } else if (m2) {
    dia = Number(m2[1]); mes = MESES_ABREV[m2[2].toLowerCase().slice(0, 3)]; ano = m2[3] ? Number(m2[3]) : undefined;
    resto = linha.slice(m2[0].length);
  } else {
    return null;
  }
  const inferiuAno = ano === undefined;
  if (ano === undefined) {
    ano = ref.getFullYear();
    if (mes > ref.getMonth() + 1) ano -= 1;
  }
  if (!dataValida(ano, mes, dia)) return null;
  return { data: iso(ano, mes, dia), resto, inferiuAno };
}

function tipoDocumento(t: string): DocumentoAnalisado['documento'] {
  if (/fatura/.test(t) && /(cartao|credito|limite|mastercard|visa|elo\b)/.test(t)) return 'fatura_cartao';
  if (/extrato/.test(t)) return 'extrato';
  if (/(kwh|consumo|leitura atual|energia eletrica|abastecimento de agua|m3|m³|plano movel|banda larga|conta de (luz|agua|gas))/.test(t)) return 'conta_consumo';
  if (/(comprovante|recibo)/.test(t)) return 'comprovante';
  if (/fatura/.test(t)) return 'fatura_cartao';
  return 'desconhecido';
}

function acharEmissor(t: string): string | undefined {
  for (const [re, nome] of EMISSORES) if (re.test(t)) return nome;
  return undefined;
}

function acharLinhaDigitavel(linhas: string[]): string | undefined {
  for (const l of linhas) {
    const digitos = l.replace(/[\s.\-]/g, '');
    const m = digitos.match(/\d{44,48}/);
    if (m && digitos.length - m[0].length < 6) return l.trim();
  }
  return undefined;
}

/** Valores monetários de uma linha, com o sinal indicado (prefixo/sufixo). */
function valoresDaLinha(linha: string) {
  const out: Array<{ valor: number; credito: boolean | null; indice: number; bruto: string }> = [];
  RE_VALOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_VALOR.exec(linha))) {
    const pre = m[1];
    const suf = (m[3] ?? '').toUpperCase();
    let credito: boolean | null = null;
    if (pre === '-' || pre === '−' || suf === '-' || suf === '−' || suf === 'C') credito = true;
    else if (pre === '+') credito = true;
    else if (suf === 'D') credito = false;
    out.push({ valor: parseValorBR(m[2]), credito, indice: m.index, bruto: m[0] });
  }
  return out;
}

function acharValorPorRotulo(linhas: string[], rotulos: RegExp): number | undefined {
  for (let i = 0; i < linhas.length; i++) {
    const n = normalizar(linhas[i]);
    if (!rotulos.test(n)) continue;
    const aqui = valoresDaLinha(linhas[i]);
    if (aqui.length) return aqui[aqui.length - 1].valor;
    const prox = linhas[i + 1] ? valoresDaLinha(linhas[i + 1]) : [];
    if (prox.length) return prox[0].valor;
  }
  return undefined;
}

function acharVencimento(linhas: string[]): string | undefined {
  for (let i = 0; i < linhas.length; i++) {
    if (!/vencimento|vence em|data de venc/.test(normalizar(linhas[i]))) continue;
    const d = acharDataCompleta(linhas[i]) ?? (linhas[i + 1] ? acharDataCompleta(linhas[i + 1]) : undefined);
    if (d) return d;
  }
  return undefined;
}

function limparDescricao(s: string) {
  return s
    .replace(/R\$\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
    .trim();
}

function descricaoAmigavel(original: string) {
  return original
    .replace(/^(MP|PAG|PG|EC|PP|SQ|IZ|EBN|PAYPAL|DL|HTM)\s*\*\s*/i, '')
    .replace(/\s+\d{4,}$/, '')
    .replace(/\s+PARC(ELA)?\s*\d{1,2}\s*\/\s*\d{1,2}/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function interpretarTexto(texto: string, opcoes: OpcoesInterpretacao = {}): ResultadoInterpretacao {
  const hoje = opcoes.hoje ?? new Date();
  const regras = opcoes.regras ?? {};
  const existentes = opcoes.existentes ?? new Set<string>();
  const avisos: string[] = [];

  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
  const tudo = normalizar(linhas.join('\n'));

  const documento = tipoDocumento(tudo);
  const emissor = acharEmissor(tudo);
  const vencimento = acharVencimento(linhas);
  const linhaDigitavel = acharLinhaDigitavel(linhas);
  const totalDocumento = acharValorPorRotulo(
    linhas,
    /(total (da|desta) fatura|valor total|total a pagar|valor a pagar|valor do documento|total geral|valor cobrado)/,
  );

  // Referência para inferir o ano de datas "dd/mm": o vencimento, ou hoje
  const ref = vencimento ? new Date(`${vencimento}T12:00:00`) : hoje;

  const transacoes: TransacaoExtraida[] = [];
  let anoInferido = false;

  for (const linha of linhas) {
    const dt = dataNoInicio(linha, ref);
    if (!dt) continue;
    const valores = valoresDaLinha(dt.resto);
    if (!valores.length) continue;

    // Em extratos a última coluna costuma ser o saldo: com 2+ valores, a transação é o penúltimo
    const alvo = documento === 'extrato' && valores.length >= 2 ? valores[valores.length - 2] : valores[valores.length - 1];
    if (!alvo.valor || alvo.valor <= 0) continue;

    const descricaoOriginal = limparDescricao(dt.resto.slice(0, alvo.indice));
    const n = normalizar(descricaoOriginal);
    if (!descricaoOriginal || descricaoOriginal.length < 2 || !/[a-z]/i.test(descricaoOriginal)) continue;
    if (contem(n, RESUMO) && !contem(n, PAGAMENTO_FATURA)) continue;

    if (dt.inferiuAno) anoInferido = true;

    // ---------- natureza e tipo ----------
    let natureza: TransacaoExtraida['natureza'] = 'compra';
    let tipo: TipoMov = 'despesa';
    const pagamento = contem(n, PAGAMENTO_FATURA);

    if (pagamento) {
      natureza = 'pagamento';
      tipo = 'receita';
    } else if (contem(n, ESTORNO)) {
      natureza = 'estorno';
      tipo = 'receita';
    } else if (contem(n, RECEITA)) {
      natureza = 'receita';
      tipo = 'receita';
    } else if (alvo.credito === true) {
      // Crédito sem palavra-chave conhecida: entra como receita, mas pede confirmação
      natureza = documento === 'fatura_cartao' ? 'estorno' : 'receita';
      tipo = 'receita';
    } else if (contem(n, TRANSFERENCIA)) {
      natureza = 'transferencia';
    } else if (contem(n, TARIFA)) {
      natureza = 'tarifa';
    }
    if (documento === 'extrato' && alvo.credito === false) tipo = 'despesa';

    const cls = classificar(descricaoOriginal, tipo, regras);
    let categoria = cls.categoria;
    let confianca = cls.confianca;
    let motivo: string | undefined = cls.confianca < LIMITE_CONFIANCA ? cls.motivo : undefined;

    if (natureza === 'estorno' && !contem(n, ESTORNO)) {
      categoria = 'Estorno';
      confianca = Math.min(confianca, 0.5);
      motivo = 'Valor lançado como crédito no documento, sem indicação clara de que seja um estorno.';
    }
    if (natureza === 'transferencia' && !regras[n]) {
      categoria = 'Transferências';
      confianca = Math.min(confianca, 0.5);
      motivo = 'Transferência: não dá para saber pelo documento se é pagamento de algo, envio entre suas contas ou outra finalidade.';
    }
    if (natureza === 'tarifa') {
      categoria = 'Impostos e taxas';
      confianca = Math.max(confianca, 0.85);
      motivo = undefined;
    }

    const parcela = detectarParcela(descricaoOriginal.replace(/^\d{1,2}\/\d{1,2}\s/, ''));
    const descricao = descricaoAmigavel(descricaoOriginal) || descricaoOriginal;
    const duplicada = existentes.has(hashMov(dt.data, alvo.valor, descricao)) || existentes.has(hashMov(dt.data, alvo.valor, descricaoOriginal));

    transacoes.push({
      id: uid(),
      data: dt.data,
      descricao,
      descricaoOriginal,
      estabelecimento: descricaoOriginal.includes('*') ? descricaoOriginal.split('*').pop()?.trim() : undefined,
      valor: Math.round(alvo.valor * 100) / 100,
      tipo,
      natureza,
      categoria: pagamento ? 'Transferências' : categoria,
      confianca: pagamento ? 0.99 : confianca,
      parcela,
      pagamentoFatura: pagamento && documento !== 'extrato',
      linhaOrigem: linha,
      status: pagamento && documento !== 'extrato'
        ? 'ignorada'
        : duplicada
          ? 'duplicada'
          : confianca < LIMITE_CONFIANCA ? 'duvida' : 'pendente',
      motivoDuvida: pagamento && documento !== 'extrato'
        ? 'Pagamento da fatura anterior: não é uma nova despesa. As compras individuais já estão listadas.'
        : duplicada
          ? 'Lançamento idêntico já existe nas suas movimentações.'
          : confianca < LIMITE_CONFIANCA ? motivo : undefined,
    });
  }

  // Conta de consumo / boleto sem itens datados: o próprio total é a despesa, se houver total e vencimento.
  if (!transacoes.length && (documento === 'conta_consumo') && totalDocumento && vencimento) {
    const nomeConta = emissor ? `Conta ${emissor}` : 'Conta de consumo';
    const cls = classificar(`${emissor ?? ''} ${tudo.slice(0, 400)}`, 'despesa', regras);
    transacoes.push({
      id: uid(),
      data: vencimento,
      descricao: nomeConta,
      descricaoOriginal: nomeConta,
      valor: totalDocumento,
      tipo: 'despesa',
      natureza: 'compra',
      categoria: cls.categoria,
      confianca: Math.min(cls.confianca, 0.9),
      status: cls.confianca < LIMITE_CONFIANCA ? 'duvida' : 'pendente',
      motivoDuvida: cls.confianca < LIMITE_CONFIANCA ? 'Não identifiquei o tipo de conta (luz, água, telefone…).' : undefined,
    });
    avisos.push('Documento sem itens datados: usei o total e o vencimento encontrados como uma única despesa.');
  }

  // Comprovante (ex.: PIX): um único valor e uma data em qualquer posição
  if (!transacoes.length && documento === 'comprovante') {
    const data = linhas.map(acharDataCompleta).find(Boolean);
    const valor = acharValorPorRotulo(linhas, /(valor|total|quantia)/);
    if (data && valor) {
      const recebido = /(recebid|credito)/.test(tudo);
      const favorecido = linhas.find((l) => /^(para|destino|favorecido|recebedor|nome)\b/i.test(normalizar(l)));
      transacoes.push({
        id: uid(),
        data,
        descricao: favorecido ? limparDescricao(favorecido.replace(/^(para|destino|favorecido|recebedor|nome)\s*:?/i, '')) : 'Transferência (comprovante)',
        descricaoOriginal: favorecido ?? 'Comprovante sem favorecido identificado',
        valor,
        tipo: recebido ? 'receita' : 'despesa',
        natureza: 'transferencia',
        categoria: 'Transferências',
        confianca: 0.45,
        status: 'duvida',
        motivoDuvida: 'Comprovante de transferência: confirme a que se refere antes de classificar.',
      });
    }
  }

  // ---------- conferências ----------
  if (anoInferido) {
    avisos.push(`Algumas datas não traziam o ano; usei ${vencimento ? 'o vencimento do documento' : 'a data de hoje'} como referência. Confira na revisão.`);
  }
  if (documento === 'fatura_cartao' && totalDocumento !== undefined && transacoes.length) {
    const compras = transacoes.filter((t) => !t.pagamentoFatura);
    const liquido = compras.reduce((s, t) => s + (t.tipo === 'despesa' ? t.valor : -t.valor), 0);
    if (Math.abs(liquido - totalDocumento) > 0.05) {
      avisos.push(
        `A soma dos lançamentos lidos (${liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) ` +
        `difere do total do documento (${totalDocumento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). ` +
        'Pode haver saldo anterior, encargos ou linhas não reconhecidas — revise antes de importar.',
      );
    }
  }
  if (!transacoes.length) {
    avisos.push('Não reconheci transações neste documento. Você pode lançá-las manualmente na revisão, com o arquivo ao lado.');
  }

  return { documento, emissor, totalDocumento, vencimento, linhaDigitavel, transacoes, avisos };
}
