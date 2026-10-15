import { COLECOES, type Colecao, type EstadoApp, type Registro } from '@/types';
import { estadoVazio, lerArquivo, MEMORIA_PADRAO, PREFS_PADRAO, salvarArquivo } from './db';

/**
 * Exportação e importação de backups do contAI (arquivo JSON local).
 * A importação valida TODO o conteúdo antes de gravar qualquer coisa.
 */

export const FORMATO = 'contai-backup';
export const VERSAO_BACKUP = 1;
const LIMITE_BYTES = 200 * 1024 * 1024;

export interface ArquivoBackup {
  formato: typeof FORMATO;
  versao: number;
  app: 'contAI';
  exportadoEm: string;
  aviso: string;
  dados: Omit<EstadoApp, never>;
  arquivos?: Record<string, { tipo: string; base64: string }>;
}

function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => falha(r.error);
    r.readAsDataURL(b);
  });
}

export async function gerarBackup(estado: EstadoApp, incluirArquivos: boolean): Promise<Blob> {
  const arquivos: ArquivoBackup['arquivos'] = {};
  if (incluirArquivos) {
    for (const d of estado.documentos) {
      const blob = await lerArquivo(d.id);
      if (blob) arquivos[d.id] = { tipo: blob.type || d.tipo, base64: await blobParaBase64(blob) };
    }
  }
  const conteudo: ArquivoBackup = {
    formato: FORMATO,
    versao: VERSAO_BACKUP,
    app: 'contAI',
    exportadoEm: new Date().toISOString(),
    aviso: 'Contém dados financeiros pessoais. Guarde em local seguro.',
    dados: estado,
    ...(incluirArquivos ? { arquivos } : {}),
  };
  return new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' });
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------ validação ------------------------------ */

type Regra = Record<string, 'string' | 'number' | 'boolean' | 'data' | '?string' | '?number' | '?boolean' | '?data'>;

const DATA = /^\d{4}-\d{2}-\d{2}/;

const ESQUEMAS: Record<Colecao, Regra> = {
  contas: { nome: 'string', tipo: 'string', saldoInicial: 'number', cor: 'string', limite: '?number' },
  movimentacoes: { tipo: 'string', descricao: 'string', valor: 'number', data: 'data', categoria: 'string', contaId: 'string', origem: 'string' },
  faturas: { emissor: 'string', referencia: 'string', valor: 'number', vencimento: 'data', status: 'string', cor: 'string', sigla: 'string' },
  documentos: { nome: 'string', tipo: 'string', tamanho: 'number', sha256: 'string', paginas: 'number' },
  investimentos: { nome: 'string', modalidade: 'string', valorInvestido: 'number', rentabilidade: 'number', atualizadoEm: 'data', ativo: 'boolean' },
  metas: { nome: 'string', alvo: 'number', atual: 'number', prazo: 'data', cor: 'string' },
  orcamentos: { categoria: 'string', limite: 'number' },
  recorrentes: { descricao: 'string', valor: 'number', diaVencimento: 'number', tipo: 'string', categoria: 'string', ativo: 'boolean' },
  categorias: { nome: 'string', tipo: 'string' },
  regras: { padrao: 'string', categoria: 'string', origem: 'string' },
  correcoes: { descricao: 'string', de: 'string', para: 'string', em: 'data' },
  conversas: { autor: 'string', texto: 'string', em: 'data' },
};

const ENUMS: Partial<Record<Colecao, Record<string, string[]>>> = {
  contas: { tipo: ['corrente', 'poupanca', 'cartao', 'carteira'] },
  movimentacoes: { tipo: ['receita', 'despesa'], origem: ['manual', 'importacao', 'ia'] },
  faturas: { status: ['pendente', 'paga', 'em_analise'] },
  recorrentes: { tipo: ['receita', 'despesa'] },
  categorias: { tipo: ['receita', 'despesa'] },
  conversas: { autor: ['user', 'ia'] },
};

function confere(valor: unknown, tipo: Regra[string]): boolean {
  const opcional = tipo.startsWith('?');
  if (opcional && (valor === undefined || valor === null)) return true;
  const t = tipo.replace('?', '');
  if (t === 'number') return typeof valor === 'number' && Number.isFinite(valor);
  if (t === 'data') return typeof valor === 'string' && DATA.test(valor);
  if (t === 'string') return typeof valor === 'string' && valor.length <= 20000;
  return typeof valor === t;
}

export interface ResultadoValidacao {
  ok: boolean;
  erros: string[];
  estado?: EstadoApp;
  arquivos?: ArquivoBackup['arquivos'];
  resumo?: Array<[string, number]>;
  exportadoEm?: string;
}

export async function validarBackup(arquivo: File): Promise<ResultadoValidacao> {
  const erros: string[] = [];
  if (arquivo.size > LIMITE_BYTES) return { ok: false, erros: ['Arquivo grande demais para um backup do contAI (limite de 200 MB).'] };
  if (!/\.json$/i.test(arquivo.name) && arquivo.type !== 'application/json') {
    return { ok: false, erros: ['Selecione o arquivo .json gerado pela exportação do contAI.'] };
  }

  let json: unknown;
  try {
    json = JSON.parse(await arquivo.text());
  } catch {
    return { ok: false, erros: ['O arquivo não é um JSON válido ou está corrompido.'] };
  }

  const b = json as Partial<ArquivoBackup>;
  if (!b || typeof b !== 'object' || b.formato !== FORMATO) {
    return { ok: false, erros: ['Este arquivo não é um backup do contAI (formato não reconhecido).'] };
  }
  if (typeof b.versao !== 'number' || b.versao > VERSAO_BACKUP) {
    return { ok: false, erros: [`Backup de uma versão mais nova do contAI (v${String(b.versao)}). Atualize o aplicativo antes de importar.`] };
  }
  const dados = b.dados as Partial<EstadoApp> | undefined;
  if (!dados || typeof dados !== 'object') return { ok: false, erros: ['O backup não contém a seção de dados.'] };

  const estado = estadoVazio();
  for (const c of COLECOES) {
    const lista = (dados as Record<string, unknown>)[c];
    if (lista === undefined) continue;
    if (!Array.isArray(lista)) { erros.push(`"${c}" deveria ser uma lista.`); continue; }
    const ids = new Set<string>();
    lista.forEach((item, i) => {
      if (!item || typeof item !== 'object') { erros.push(`${c}[${i}]: registro inválido.`); return; }
      const r = item as Record<string, unknown>;
      if (typeof r.id !== 'string' || !r.id) { erros.push(`${c}[${i}]: sem identificador.`); return; }
      if (ids.has(r.id)) { erros.push(`${c}[${i}]: identificador repetido (${r.id}).`); return; }
      ids.add(r.id);
      for (const [campo, tipo] of Object.entries(ESQUEMAS[c])) {
        if (!confere(r[campo], tipo)) erros.push(`${c}[${i}].${campo}: valor ausente ou inválido.`);
      }
      for (const [campo, valores] of Object.entries(ENUMS[c] ?? {})) {
        if (!valores.includes(String(r[campo]))) erros.push(`${c}[${i}].${campo}: “${String(r[campo])}” não é aceito.`);
      }
      if (c === 'movimentacoes' && typeof r.valor === 'number' && r.valor < 0) erros.push(`${c}[${i}].valor: deve ser positivo.`);
    });
    (estado as unknown as Record<Colecao, Registro[]>)[c] = lista as Registro[];
  }

  // Referências: movimentações precisam apontar para contas existentes
  const contas = new Set(estado.contas.map((x) => x.id));
  const orfas = estado.movimentacoes.filter((m) => !contas.has(m.contaId)).length;
  if (orfas) erros.push(`${orfas} movimentação(ões) apontam para contas que não existem no backup.`);

  if (dados.prefs && typeof dados.prefs === 'object') {
    const p = dados.prefs as unknown as Record<string, unknown>;
    estado.prefs = {
      ...PREFS_PADRAO,
      consentimentoIA: typeof p.consentimentoIA === 'boolean' ? p.consentimentoIA : PREFS_PADRAO.consentimentoIA,
      // Consentimento de envio externo NUNCA é restaurado: precisa ser dado de novo neste navegador
      consentimentoEnvioExterno: false,
      ocultarValores: p.ocultarValores === true,
      avisoPrivacidadeVisto: p.avisoPrivacidadeVisto === true,
      taxas: typeof p.taxas === 'object' && p.taxas ? (p.taxas as EstadoApp['prefs']['taxas']) : undefined,
    };
  }
  if (dados.memoria && typeof dados.memoria === 'object') {
    const m = dados.memoria as Partial<EstadoApp['memoria']>;
    estado.memoria = {
      ...MEMORIA_PADRAO,
      preferencias: Array.isArray(m.preferencias) ? m.preferencias.filter((x) => x && typeof x.texto === 'string' && typeof x.id === 'string') : [],
      contexto: m.contexto,
    };
  }

  const arquivos = b.arquivos && typeof b.arquivos === 'object' ? b.arquivos : undefined;
  if (arquivos) {
    for (const [id, a] of Object.entries(arquivos)) {
      if (!a || typeof a.base64 !== 'string' || typeof a.tipo !== 'string') erros.push(`Arquivo anexado ${id}: conteúdo inválido.`);
    }
  }

  if (erros.length) {
    return { ok: false, erros: erros.length > 12 ? [...erros.slice(0, 12), `…e mais ${erros.length - 12} problema(s).`] : erros };
  }

  return {
    ok: true,
    erros: [],
    estado,
    arquivos,
    exportadoEm: typeof b.exportadoEm === 'string' ? b.exportadoEm : undefined,
    resumo: [
      ['Movimentações', estado.movimentacoes.length],
      ['Contas e cartões', estado.contas.length],
      ['Faturas', estado.faturas.length],
      ['Investimentos', estado.investimentos.length],
      ['Metas', estado.metas.length],
      ['Orçamentos', estado.orcamentos.length],
      ['Recorrentes', estado.recorrentes.length],
      ['Mensagens do assistente', estado.conversas.length],
      ['Arquivos de documentos', arquivos ? Object.keys(arquivos).length : 0],
    ],
  };
}

export async function gravarArquivosDoBackup(arquivos: NonNullable<ArquivoBackup['arquivos']>) {
  for (const [id, a] of Object.entries(arquivos)) {
    const bin = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
    await salvarArquivo(id, new Blob([bin], { type: a.tipo }));
  }
}
