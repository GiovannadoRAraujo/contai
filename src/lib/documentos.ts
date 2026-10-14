import type { DocumentoAnalisado, EstadoApp, TransacaoExtraida } from '@/types';
import { classificar, detectarParcela, ehPagamentoDeFatura, detectarTipo, LIMITE_CONFIANCA } from './classificador';
import { hashMov } from './finance';
import { uid } from './format';

/**
 * Camada de serviço de leitura de documentos.
 *
 * Em produção, `VITE_IA_ENDPOINT` deve apontar para um backend próprio que
 * encapsula o OCR e o modelo de linguagem. Nenhuma chave de API é lida ou
 * exposta no frontend. Sem esse endpoint configurado, o contAI roda com um
 * extrator local de demonstração — e todo documento analisado fica marcado
 * com `demo: true`, sinalizado na interface.
 */
export const IA_ENDPOINT: string = (import.meta.env.VITE_IA_ENDPOINT as string) ?? '';
export const IA_CONFIGURADA = IA_ENDPOINT.length > 0;

/* ------------------------------------------------------------------ *
 * Gerador determinístico (mesmo arquivo => mesma leitura)
 * ------------------------------------------------------------------ */
function semente(txt: string) {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(s: number) {
  let a = s;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOGO: Array<[string, number, number]> = [
  ['IFOOD *IFOOD', 28, 140],
  ['UBER *TRIP', 12, 65],
  ['POSTO SHELL AV PAULISTA', 90, 320],
  ['DROGARIA SAO PAULO', 25, 180],
  ['SUPERMERCADO PAO DE ACUCAR', 120, 480],
  ['NETFLIX.COM', 39.9, 55.9],
  ['SPOTIFY P1A2B3', 21.9, 34.9],
  ['AMAZON BR MARKETPLACE', 45, 390],
  ['MERCADOLIVRE*MERCADOLIV', 30, 280],
  ['RESTAURANTE DONA LUCIA', 38, 160],
  ['CINEMARK SHOPPING', 32, 96],
  ['CLARO MOVEL', 59.9, 159.9],
  ['PADARIA BELLA VISTA', 12, 60],
  ['MP*SERVDIGITAL', 19.9, 129.9],
  ['PAG*LOJA2231', 25, 210],
  ['PICPAY*PGTO', 15, 180],
  ['ESTACIONAMENTO CENTRAL', 10, 45],
  ['ALURA CURSOS ONLINE', 85, 125],
];

const EMISSORES = ['Nubank', 'Itaú', 'Bradesco', 'Inter', 'C6 Bank', 'Santander'];

function tipoDocumento(nome: string, mime: string): DocumentoAnalisado['documento'] {
  const n = nome.toLowerCase();
  if (/fatura|cart[aã]o|invoice/.test(n)) return 'fatura_cartao';
  if (/extrato|statement/.test(n)) return 'extrato';
  if (/luz|energia|[aá]gua|g[aá]s|internet|boleto|conta/.test(n)) return 'conta_consumo';
  if (/comprovante|recibo|pix/.test(n)) return 'comprovante';
  return mime.startsWith('image/') ? 'extrato' : 'fatura_cartao';
}

function dataAleatoria(r: () => number, mesesAtras = 0) {
  const base = new Date();
  base.setMonth(base.getMonth() - mesesAtras);
  const diasNoMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const d = Math.max(1, Math.min(diasNoMes, Math.floor(r() * diasNoMes) + 1));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const dinheiro = (r: () => number, min: number, max: number) =>
  Math.round((min + r() * (max - min)) * 100) / 100;

/** Extrator local de demonstração. */
function extrairDemo(arquivo: File, estado: EstadoApp): DocumentoAnalisado {
  const r = rng(semente(`${arquivo.name}:${arquivo.size}:${arquivo.lastModified}`));
  const doc = tipoDocumento(arquivo.name, arquivo.type);
  const nomeNormalizado = arquivo.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const emissor =
    EMISSORES.find((e) => nomeNormalizado.includes(e.toLowerCase().replace(/[^a-z0-9]/g, ''))) ??
    EMISSORES[Math.floor(r() * EMISSORES.length)];

  const existentes = new Set(
    estado.movimentacoes.map((m) => m.hash ?? hashMov(m.data, m.valor, m.descricao)),
  );

  const transacoes: TransacaoExtraida[] = [];
  const empurrar = (descricao: string, valor: number, data: string, forcarDuvida = false) => {
    const tipo = detectarTipo(descricao);
    const cls = classificar(descricao, tipo, estado.regrasCategoria);
    const parcela = detectarParcela(descricao);
    const pagamento = ehPagamentoDeFatura(descricao);
    const duplicada = existentes.has(hashMov(data, valor, descricao));
    transacoes.push({
      id: uid(),
      data,
      descricao: descricao
        .replace(/^[A-Z]{2,4}\*/, '')
        .replace(/\s+\d{4,}$/, '')
        .trim(),
      descricaoOriginal: descricao,
      estabelecimento: descricao.split('*').pop()?.trim(),
      valor,
      tipo,
      categoria: cls.categoria,
      confianca: pagamento ? 0.99 : cls.confianca,
      parcela,
      pagamentoFatura: pagamento,
      status: pagamento
        ? 'ignorada'
        : duplicada
          ? 'duplicada'
          : forcarDuvida || cls.confianca < LIMITE_CONFIANCA
            ? 'duvida'
            : 'pendente',
      motivoDuvida: pagamento
        ? 'Pagamento da fatura: não é uma nova despesa. As compras individuais já estão listadas abaixo.'
        : duplicada
          ? 'Lançamento idêntico já existe nas suas movimentações.'
          : cls.confianca < LIMITE_CONFIANCA
            ? cls.motivo
            : undefined,
    });
  };

  if (doc === 'conta_consumo') {
    const valor = dinheiro(r, 89, 320);
    const venc = dataAleatoria(r, 0);
    empurrar(`${emissor === 'Itaú' ? 'ENEL' : 'SABESP'} - FATURA MENSAL`, valor, venc);
    return montar(arquivo, doc, emissor, transacoes, valor, venc, r);
  }

  if (doc === 'comprovante') {
    const valor = dinheiro(r, 25, 850);
    const data = dataAleatoria(r, 0);
    empurrar(r() > 0.5 ? 'PIX ENVIADO - TRANSFERENCIA' : 'PIX RECEBIDO - TRANSFERENCIA', valor, data, true);
    return montar(arquivo, doc, emissor, transacoes, valor, undefined, r);
  }

  const qtd = 6 + Math.floor(r() * 6);
  const usados = new Set<number>();
  for (let i = 0; i < qtd; i++) {
    let idx = Math.floor(r() * CATALOGO.length);
    let tentativas = 0;
    while (usados.has(idx) && tentativas++ < 6) idx = (idx + 1) % CATALOGO.length;
    usados.add(idx);
    const [nome, min, max] = CATALOGO[idx];
    const temParcela = r() > 0.78;
    const total = 2 + Math.floor(r() * 9);
    const atual = 1 + Math.floor(r() * total);
    const descricao = temParcela ? `${nome} PARC ${String(atual).padStart(2, '0')}/${String(total).padStart(2, '0')}` : nome;
    empurrar(descricao, dinheiro(r, min, max), dataAleatoria(r, doc === 'fatura_cartao' ? 1 : 0));
  }

  // Garante ao menos um lançamento ambíguo (exige confirmação do usuário)
  if (!transacoes.some((t) => t.descricaoOriginal.includes('SERVDIGITAL'))) {
    empurrar('MP*SERVDIGITAL', 89.9, dataAleatoria(r, doc === 'fatura_cartao' ? 1 : 0), true);
  }
  // E um crédito, para provar que nem todo documento é só despesa
  empurrar('ESTORNO DE COMPRA NAO RECONHECIDA', dinheiro(r, 20, 160), dataAleatoria(r, 0));

  if (doc === 'fatura_cartao') {
    empurrar('PAGAMENTO RECEBIDO - OBRIGADO', dinheiro(r, 600, 1600), dataAleatoria(r, 1));
  }

  const total = transacoes
    .filter((t) => !t.pagamentoFatura && t.tipo === 'despesa')
    .reduce((s, t) => s + t.valor, 0);

  const venc = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5 + Math.floor(r() * 12));
    return d.toISOString().slice(0, 10);
  })();

  return montar(arquivo, doc, emissor, transacoes, Math.round(total * 100) / 100, venc, r);
}

function montar(
  arquivo: File,
  documento: DocumentoAnalisado['documento'],
  emissor: string,
  transacoes: TransacaoExtraida[],
  total: number,
  vencimento: string | undefined,
  r: () => number,
): DocumentoAnalisado {
  return {
    id: uid(),
    arquivoNome: arquivo.name,
    arquivoTipo: arquivo.type || 'application/octet-stream',
    arquivoUrl: URL.createObjectURL(arquivo),
    paginas: documento === 'fatura_cartao' ? 1 + Math.floor(r() * 4) : 1,
    emissor,
    documento,
    totalDocumento: total,
    vencimento,
    transacoes: transacoes.sort((a, b) => b.data.localeCompare(a.data)),
    analisadoEm: new Date().toISOString(),
    demo: true,
  };
}

export const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'];
export const TAMANHO_MAX = 12 * 1024 * 1024; // 12 MB

export function validarArquivo(f: File): string | null {
  const extOk = /\.(png|jpe?g|webp|heic|pdf)$/i.test(f.name);
  if (!TIPOS_ACEITOS.includes(f.type) && !extOk) {
    return `"${f.name}": formato não suportado. Envie imagem (PNG, JPG, WEBP) ou PDF.`;
  }
  if (f.size > TAMANHO_MAX) {
    return `"${f.name}": arquivo com ${(f.size / 1024 / 1024).toFixed(1)} MB. O limite é 12 MB.`;
  }
  if (f.size === 0) return `"${f.name}": arquivo vazio.`;
  return null;
}

/**
 * Analisa um documento. Usa o backend de IA quando `VITE_IA_ENDPOINT` está
 * configurado; caso contrário, a extração local de demonstração.
 */
export async function analisarDocumento(arquivo: File, estado: EstadoApp): Promise<DocumentoAnalisado> {
  if (IA_CONFIGURADA) {
    const form = new FormData();
    form.append('arquivo', arquivo);
    const resp = await fetch(`${IA_ENDPOINT}/documentos/analisar`, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`Falha na análise do documento (HTTP ${resp.status}).`);
    const dados = (await resp.json()) as DocumentoAnalisado;
    return { ...dados, arquivoUrl: URL.createObjectURL(arquivo), demo: false };
  }

  // Demonstração: tempo de processamento simulado para exercitar os estados de carregamento
  await new Promise((r) => setTimeout(r, 900 + Math.random() * 900));
  return extrairDemo(arquivo, estado);
}
