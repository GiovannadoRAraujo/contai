import type { DocumentoAnalisado, EstadoApp, TransacaoExtraida } from '@/types';
import { hashMov } from './finance';
import { uid } from './format';
import { mapaRegras } from './categorias';
import { interpretarTexto } from './leitura/interpretar';
import type { Progresso } from './leitura/extrair';

/**
 * Camada de serviço de leitura de documentos.
 *
 * 1. Leitura local (padrão): PDFs com texto via pdf.js e imagens/PDFs escaneados
 *    via OCR Tesseract, tudo no navegador. O texto é interpretado por regras
 *    (`leitura/interpretar.ts`) — não por um modelo de linguagem.
 * 2. Serviço de IA (opcional): `VITE_IA_ENDPOINT` aponta para um backend próprio
 *    que guarda as credenciais de OCR/LLM. Só é usado com o consentimento
 *    explícito do usuário para envio externo. Nenhuma chave fica no frontend.
 */
export const IA_ENDPOINT: string = (import.meta.env.VITE_IA_ENDPOINT as string | undefined)?.replace(/\/$/, '') ?? '';
export const IA_CONFIGURADA = IA_ENDPOINT.length > 0;

export const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const TAMANHO_MAX = 15 * 1024 * 1024; // 15 MB

const ASSINATURAS: Array<{ tipo: string; bytes: number[] }> = [
  { tipo: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },        // %PDF
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },             // RIFF
];

/** Validação de formato, tamanho e conteúdo real (assinatura do arquivo). */
export async function validarArquivo(f: File): Promise<string | null> {
  if (f.size === 0) return `"${f.name}": o arquivo está vazio.`;
  if (f.size > TAMANHO_MAX) return `"${f.name}": ${(f.size / 1024 / 1024).toFixed(1)} MB. O limite é 15 MB por arquivo.`;
  if (/\.(heic|heif)$/i.test(f.name) || /heic|heif/.test(f.type)) {
    return `"${f.name}": fotos HEIC (iPhone) não são lidas pelo navegador. Exporte como JPG ou tire um print da tela.`;
  }
  const cabecalho = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  const real = ASSINATURAS.find((a) => a.bytes.every((b, i) => cabecalho[i] === b));
  if (!real) return `"${f.name}": formato não suportado. Envie PDF ou imagem PNG, JPG ou WEBP.`;
  if (real.tipo === 'image/webp' && String.fromCharCode(...cabecalho.slice(8, 12)) !== 'WEBP') {
    return `"${f.name}": o conteúdo não corresponde a uma imagem válida.`;
  }
  return null;
}

export const tipoReal = (f: File) => (f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/*'));

async function hashArquivos(arquivos: File[]): Promise<string> {
  if (crypto?.subtle) {
    const { sha256 } = await import('./leitura/extrair');
    return sha256(arquivos);
  }
  // Contexto sem crypto.subtle (http fora de localhost): hash simples de nome+tamanho+data
  const base = arquivos.map((a) => `${a.name}:${a.size}:${a.lastModified}`).join('|');
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `fnv-${(h >>> 0).toString(16)}`;
}

function contexto(estado: EstadoApp) {
  return {
    regras: mapaRegras(estado.regras),
    existentes: new Set(estado.movimentacoes.map((m) => m.hash ?? hashMov(m.data, m.valor, m.descricao))),
  };
}

export interface OpcoesAnalise {
  /** Usuário autorizou enviar ESTE documento ao serviço externo de IA. */
  envioExterno: boolean;
  onProgresso: (p: Progresso) => void;
}

/**
 * Analisa um documento (um PDF, ou uma ou mais imagens que formam o mesmo documento).
 */
export async function analisarDocumento(arquivos: File[], estado: EstadoApp, op: OpcoesAnalise): Promise<DocumentoAnalisado> {
  const principal = arquivos[0];
  const sha = await hashArquivos(arquivos);
  const jaImportado = estado.documentos.find((d) => d.sha256 === sha && d.importadoEm);
  const ehPdf = tipoReal(principal) === 'application/pdf';

  const base = {
    id: uid(),
    arquivo: principal,
    arquivoNome: arquivos.length > 1 ? `${principal.name} (+${arquivos.length - 1} página(s))` : principal.name,
    arquivoTipo: tipoReal(principal),
    arquivoUrl: URL.createObjectURL(principal),
    sha256: sha,
    analisadoEm: new Date().toISOString(),
    jaImportadoEm: jaImportado?.importadoEm,
    demo: false,
  };

  if (IA_CONFIGURADA && op.envioExterno) {
    op.onProgresso({ etapa: 'Enviando ao serviço de IA configurado…', pct: 30 });
    const form = new FormData();
    arquivos.forEach((a) => form.append('arquivo', a));
    const resp = await fetch(`${IA_ENDPOINT}/documentos/analisar`, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`O serviço de IA recusou o documento (HTTP ${resp.status}). Tente a leitura local.`);
    const dados = (await resp.json()) as Partial<DocumentoAnalisado>;
    op.onProgresso({ etapa: 'Conferindo o resultado…', pct: 95 });
    const ctx = contexto(estado);
    const transacoes = (dados.transacoes ?? []).map((t) => marcarDuplicada({ ...t, id: t.id ?? uid() }, ctx.existentes));
    return {
      ...base,
      paginas: dados.paginas ?? arquivos.length,
      documento: dados.documento ?? 'desconhecido',
      emissor: dados.emissor,
      totalDocumento: dados.totalDocumento,
      vencimento: dados.vencimento,
      linhaDigitavel: dados.linhaDigitavel,
      transacoes,
      metodo: 'servico-ia',
      avisos: dados.avisos ?? [],
    };
  }

  const { extrairTextoPdf, extrairTextoImagens } = await import('./leitura/extrair');
  const lido = ehPdf ? await extrairTextoPdf(principal, op.onProgresso) : await extrairTextoImagens(arquivos, op.onProgresso);
  op.onProgresso({ etapa: 'Identificando transações e categorias…', pct: 97 });
  const r = interpretarTexto(lido.texto, contexto(estado));

  const avisos = [...r.avisos];
  if (lido.metodo === 'ocr-local') {
    avisos.unshift('Texto obtido por OCR: números e nomes podem ter erros de leitura. Confira valores e datas.');
  }

  return {
    ...base,
    paginas: lido.paginas,
    documento: r.documento,
    emissor: r.emissor,
    totalDocumento: r.totalDocumento,
    vencimento: r.vencimento,
    linhaDigitavel: r.linhaDigitavel,
    transacoes: r.transacoes,
    metodo: lido.metodo,
    textoExtraido: lido.texto,
    avisos,
  };
}

function marcarDuplicada(t: TransacaoExtraida, existentes: Set<string>): TransacaoExtraida {
  if (t.status === 'ignorada') return t;
  return existentes.has(hashMov(t.data, t.valor, t.descricao))
    ? { ...t, status: 'duplicada', motivoDuvida: 'Lançamento idêntico já existe nas suas movimentações.' }
    : t;
}

/** Documento vazio para lançamento manual (quando a leitura não for possível). */
export function documentoManual(arquivos: File[]): DocumentoAnalisado {
  const principal = arquivos[0];
  return {
    id: uid(),
    arquivo: principal,
    arquivoNome: principal?.name ?? 'Lançamento manual',
    arquivoTipo: principal ? tipoReal(principal) : '',
    arquivoUrl: principal ? URL.createObjectURL(principal) : undefined,
    paginas: arquivos.length || 1,
    documento: 'desconhecido',
    transacoes: [],
    analisadoEm: new Date().toISOString(),
    metodo: 'manual',
    avisos: ['Lançamento manual: adicione as transações olhando o documento ao lado.'],
    demo: false,
  };
}

/**
 * Fatura de EXEMPLO, fictícia, para conhecer o fluxo sem enviar nenhum arquivo.
 * O texto passa pelo mesmo interpretador usado nos documentos reais.
 */
export function documentoExemplo(estado: EstadoApp): DocumentoAnalisado {
  const hoje = new Date();
  const venc = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 9);
  const dd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const dia = (n: number) => dd(new Date(venc.getFullYear(), venc.getMonth() - 1, n));
  const texto = [
    'BANCO EXEMPLO S.A. — DOCUMENTO FICTÍCIO DE DEMONSTRAÇÃO',
    'Fatura do cartão de crédito  Mastercard final 0000',
    `Vencimento ${dd(venc)}/${venc.getFullYear()}`,
    'Total da fatura R$ 1.037,96',
    'Lançamentos',
    `${dia(2)} PAGAMENTO RECEBIDO - OBRIGADO -1.180,40`,
    `${dia(3)} SUPERMERCADO BOM PRECO 312,45`,
    `${dia(5)} IFOOD *RESTAURANTE SABOR 58,90`,
    `${dia(6)} UBER *TRIP 23,70`,
    `${dia(8)} NETFLIX.COM 44,90`,
    `${dia(10)} MP*SERVDIGITAL 89,90`,
    `${dia(12)} DROGARIA CENTRAL 76,30`,
    `${dia(14)} LOJA ONLINE EXEMPLO PARC 02/05 149,90`,
    `${dia(15)} PAG*JOSEMARIA 120,00`,
    `${dia(18)} POSTO AVENIDA COMBUSTIVEL 180,00`,
    `${dia(20)} ESTORNO COMPRA NAO RECONHECIDA -18,09`,
  ].join('\n');
  const r = interpretarTexto(texto, { ...contexto(estado), hoje });
  return {
    id: uid(),
    arquivoNome: 'fatura-exemplo-ficticia.pdf',
    arquivoTipo: 'text/plain',
    paginas: 1,
    documento: r.documento,
    emissor: 'Banco Exemplo (fictício)',
    totalDocumento: r.totalDocumento,
    vencimento: r.vencimento,
    transacoes: r.transacoes,
    analisadoEm: new Date().toISOString(),
    metodo: 'exemplo-demo',
    textoExtraido: texto,
    avisos: ['Documento de EXEMPLO com dados fictícios, lido pelo mesmo interpretador usado nos seus arquivos.', ...r.avisos],
    demo: true,
  };
}
