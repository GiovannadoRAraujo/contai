import { COLECOES, type Colecao, type EstadoApp, type MemoriaAssistente, type Preferencias, type Registro } from '@/types';

/**
 * Persistência local do contAI em IndexedDB.
 *
 * - Um object store por coleção (chave `id`), mais `kv` para preferências e
 *   memória do assistente e `arquivos` para o conteúdo binário dos documentos.
 * - Gravações são incrementais: só os registros que mudaram (por referência)
 *   são escritos ou removidos, numa única transação por sincronização.
 * - Nada aqui é enviado para fora do navegador.
 */

export const NOME_BANCO = 'contai';
const VERSAO = 2;
const KV = 'kv';
const ARQUIVOS = 'arquivos';
/** Fila de envio da sincronização (só usada com uma conta conectada). */
const FILA = 'fila_sync';

export const PREFS_PADRAO: Preferencias = {
  consentimentoIA: true,
  consentimentoEnvioExterno: false,
  ocultarValores: false,
  avisoPrivacidadeVisto: false,
};

export const MEMORIA_PADRAO: MemoriaAssistente = { preferencias: [] };

export function estadoVazio(): EstadoApp {
  return {
    prefs: { ...PREFS_PADRAO },
    memoria: { ...MEMORIA_PADRAO, preferencias: [] },
    contas: [], movimentacoes: [], faturas: [], documentos: [], investimentos: [],
    metas: [], orcamentos: [], recorrentes: [], categorias: [], regras: [],
    correcoes: [], conversas: [],
  };
}

let conexao: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

function fim(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, falha) => {
    tx.oncomplete = () => ok();
    tx.onabort = () => falha(tx.error ?? new Error('Transação abortada'));
    tx.onerror = () => falha(tx.error);
  });
}

export function abrir(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Este navegador não oferece IndexedDB (ou ele foi bloqueado). Os dados não poderão ser salvos.'));
  }
  conexao = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_BANCO, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const c of COLECOES) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(ARQUIVOS)) db.createObjectStore(ARQUIVOS);
      if (!db.objectStoreNames.contains(FILA)) db.createObjectStore(FILA, { keyPath: 'chave' });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); conexao = null; };
      ok(db);
    };
    r.onerror = () => { conexao = null; falha(r.error); };
    r.onblocked = () => falha(new Error('O banco local está bloqueado por outra aba do contAI. Feche as outras abas e recarregue.'));
  });
  return conexao;
}

/** Lê todos os registros persistidos. Chamado antes de calcular qualquer indicador. */
export async function carregarTudo(): Promise<EstadoApp> {
  const db = await abrir();
  const tx = db.transaction([...COLECOES, KV], 'readonly');
  const estado = estadoVazio();
  const leituras = COLECOES.map(async (c) => {
    (estado as unknown as Record<Colecao, Registro[]>)[c] = await req(tx.objectStore(c).getAll());
  });
  const prefs = req(tx.objectStore(KV).get('prefs'));
  const memoria = req(tx.objectStore(KV).get('memoria'));
  await Promise.all(leituras);
  estado.prefs = { ...PREFS_PADRAO, ...((await prefs) as Partial<Preferencias> | undefined) };
  estado.memoria = { ...MEMORIA_PADRAO, preferencias: [], ...((await memoria) as Partial<MemoriaAssistente> | undefined) };
  estado.movimentacoes.sort((a, b) => b.data.localeCompare(a.data));
  estado.conversas.sort((a, b) => a.em.localeCompare(b.em));
  return estado;
}

/** Grava apenas as diferenças entre dois estados. */
export async function sincronizar(antes: EstadoApp, depois: EstadoApp): Promise<number> {
  const mudadas = COLECOES.filter((c) => antes[c] !== depois[c]);
  const prefsMudou = antes.prefs !== depois.prefs;
  const memoriaMudou = antes.memoria !== depois.memoria;
  if (!mudadas.length && !prefsMudou && !memoriaMudou) return 0;

  const db = await abrir();
  const stores = [...mudadas, ...(prefsMudou || memoriaMudou ? [KV] : [])];
  const tx = db.transaction(stores, 'readwrite');
  let operacoes = 0;

  for (const c of mudadas) {
    const store = tx.objectStore(c);
    const velhos = new Map((antes[c] as Registro[]).map((r) => [r.id, r]));
    const novos = depois[c] as Registro[];
    const ids = new Set<string>();
    for (const r of novos) {
      ids.add(r.id);
      if (velhos.get(r.id) !== r) { store.put(r); operacoes++; }
    }
    for (const id of velhos.keys()) if (!ids.has(id)) { store.delete(id); operacoes++; }
  }
  if (prefsMudou) { tx.objectStore(KV).put(depois.prefs, 'prefs'); operacoes++; }
  if (memoriaMudou) { tx.objectStore(KV).put(depois.memoria, 'memoria'); operacoes++; }

  await fim(tx);
  return operacoes;
}

/** Substitui todo o conteúdo, inclusive arquivos (usado ao restaurar um backup já validado). */
export async function substituirTudo(estado: EstadoApp): Promise<void> {
  const db = await abrir();
  const tx = db.transaction([...COLECOES, KV, ARQUIVOS], 'readwrite');
  tx.objectStore(ARQUIVOS).clear();
  for (const c of COLECOES) {
    const store = tx.objectStore(c);
    store.clear();
    for (const r of estado[c] as Registro[]) store.put(r);
  }
  tx.objectStore(KV).put(estado.prefs, 'prefs');
  tx.objectStore(KV).put(estado.memoria, 'memoria');
  await fim(tx);
}

/** Apaga todos os dados locais do contAI, inclusive os arquivos. */
export async function apagarTudo(): Promise<void> {
  const db = await abrir();
  const tx = db.transaction([...COLECOES, KV, ARQUIVOS, FILA], 'readwrite');
  for (const s of [...COLECOES, KV, ARQUIVOS, FILA]) tx.objectStore(s).clear();
  await fim(tx);
}

/* ---------------------------- Arquivos ---------------------------- */

export async function salvarArquivo(id: string, blob: Blob): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(ARQUIVOS, 'readwrite');
  tx.objectStore(ARQUIVOS).put(blob, id);
  await fim(tx);
}

export async function lerArquivo(id: string): Promise<Blob | undefined> {
  const db = await abrir();
  return req(db.transaction(ARQUIVOS, 'readonly').objectStore(ARQUIVOS).get(id)) as Promise<Blob | undefined>;
}

export async function apagarArquivo(id: string): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(ARQUIVOS, 'readwrite');
  tx.objectStore(ARQUIVOS).delete(id);
  await fim(tx);
}

/** Estimativa de uso do armazenamento do navegador (quando disponível). */
export async function usoArmazenamento(): Promise<{ usado: number; cota: number; persistente: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const persistente = (await navigator.storage.persisted?.()) ?? false;
  return { usado: e.usage ?? 0, cota: e.quota ?? 0, persistente };
}

/** Pede ao navegador para não descartar os dados automaticamente quando faltar espaço. */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/* ------------------------ Sincronização (fila e metadados) ------------------------ */

export interface ItemFila {
  chave: string;            // "<colecao>/<id>"
  colecao: string;
  id: string;
  dados?: unknown;
  modificado_em: string;
  excluido: boolean;
}

export async function enfileirar(itens: Array<Omit<ItemFila, 'chave'>>): Promise<void> {
  if (!itens.length) return;
  const db = await abrir();
  const tx = db.transaction(FILA, 'readwrite');
  for (const i of itens) tx.objectStore(FILA).put({ ...i, chave: `${i.colecao}/${i.id}` });
  await fim(tx);
}

export async function lerFila(): Promise<ItemFila[]> {
  const db = await abrir();
  return req(db.transaction(FILA, 'readonly').objectStore(FILA).getAll()) as Promise<ItemFila[]>;
}

/** Remove da fila os itens enviados — exceto os que mudaram de novo durante o envio. */
export async function confirmarEnvio(enviados: ItemFila[]): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(FILA, 'readwrite');
  const store = tx.objectStore(FILA);
  for (const e of enviados) {
    const r = store.get(e.chave);
    r.onsuccess = () => {
      const atual = r.result as ItemFila | undefined;
      if (atual && atual.modificado_em === e.modificado_em && atual.excluido === e.excluido) store.delete(e.chave);
    };
  }
  await fim(tx);
}

export async function limparFila(): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(FILA, 'readwrite');
  tx.objectStore(FILA).clear();
  await fim(tx);
}

export async function lerMeta<T>(chave: string): Promise<T | undefined> {
  const db = await abrir();
  return req(db.transaction(KV, 'readonly').objectStore(KV).get(`meta:${chave}`)) as Promise<T | undefined>;
}

export async function gravarMeta(chave: string, valor: unknown): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(KV, 'readwrite');
  if (valor === undefined) tx.objectStore(KV).delete(`meta:${chave}`);
  else tx.objectStore(KV).put(valor, `meta:${chave}`);
  await fim(tx);
}
