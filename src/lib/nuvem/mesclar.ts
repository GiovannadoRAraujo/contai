import { COLECOES, type Colecao, type EstadoApp, type MemoriaAssistente, type Preferencias, type Registro } from '@/types';

/**
 * Regras puras da sincronização entre aparelhos.
 *
 * - Cada registro viaja inteiro, com a sua data de modificação.
 * - Conflito: a alteração mais recente vence (comparando datas, não textos).
 * - Exclusões viajam como "tombstones" (excluido = true).
 * - Dados de demonstração nunca sobem.
 * - Preferências e memória do assistente viajam na coleção especial `_kv`;
 *   campos que fazem sentido só no aparelho (consentimento de envio externo,
 *   aviso de privacidade visto) não sincronizam.
 */

export interface Mudanca {
  colecao: string;
  id: string;
  dados?: unknown;
  modificado_em: string;
  excluido: boolean;
}

export interface LinhaRemota {
  colecao: string;
  id: string;
  dados: Record<string, unknown> | null;
  modificado_em: string;
  excluido: boolean;
  atualizado_servidor?: string;
}

/** Objetos que acabaram de chegar da nuvem: não devem ser reenviados (eco). */
export const vindosDaNuvem = new WeakSet<object>();
/** Exclusões que vieram da nuvem ("colecao/id"): não viram novo tombstone. */
export const excluidosDaNuvem = new Set<string>();

/** Campos de preferência compartilhados entre aparelhos. */
export const PREFS_SINCRONIZADAS = ['consentimentoIA', 'ocultarValores', 'taxas'] as const;

const ehDemo = (r: Registro) => r.demo === true || r.id.startsWith('demo-');
const tempo = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);
const EPOCA = '2000-01-01T00:00:00.000Z';

function prefsParaNuvem(p: Preferencias) {
  return { consentimentoIA: p.consentimentoIA, ocultarValores: p.ocultarValores, taxas: p.taxas ?? null, modificadoEm: p.modificadoEm };
}
function memoriaParaNuvem(m: MemoriaAssistente) {
  return { preferencias: m.preferencias, contexto: m.contexto ?? null, modificadoEm: m.modificadoEm };
}

/** O que mudou entre dois estados e precisa subir. */
export function diferencas(antes: EstadoApp, depois: EstadoApp, agora = new Date().toISOString()): Mudanca[] {
  const out: Mudanca[] = [];
  for (const c of COLECOES) {
    if (antes[c] === depois[c]) continue;
    const velhos = new Map((antes[c] as Registro[]).map((r) => [r.id, r]));
    const ids = new Set<string>();
    for (const r of depois[c] as Registro[]) {
      ids.add(r.id);
      if (velhos.get(r.id) === r || ehDemo(r) || vindosDaNuvem.has(r)) continue;
      out.push({ colecao: c, id: r.id, dados: r, modificado_em: r.modificadoEm ?? r.criadoEm ?? agora, excluido: false });
    }
    for (const [id, r] of velhos) {
      if (ids.has(id) || ehDemo(r)) continue;
      if (excluidosDaNuvem.delete(`${c}/${id}`)) continue;
      out.push({ colecao: c, id, modificado_em: agora, excluido: true });
    }
  }
  if (antes.prefs !== depois.prefs && !vindosDaNuvem.has(depois.prefs) && antes.prefs.modificadoEm !== depois.prefs.modificadoEm && depois.prefs.modificadoEm) {
    out.push({ colecao: '_kv', id: 'prefs', dados: prefsParaNuvem(depois.prefs), modificado_em: depois.prefs.modificadoEm, excluido: false });
  }
  if (antes.memoria !== depois.memoria && !vindosDaNuvem.has(depois.memoria) && depois.memoria.modificadoEm && antes.memoria.modificadoEm !== depois.memoria.modificadoEm) {
    out.push({ colecao: '_kv', id: 'memoria', dados: memoriaParaNuvem(depois.memoria), modificado_em: depois.memoria.modificadoEm, excluido: false });
  }
  return out;
}

/** Tudo o que existe localmente (primeira sincronização deste aparelho). */
export function todasAsMudancas(estado: EstadoApp): Mudanca[] {
  const out: Mudanca[] = [];
  for (const c of COLECOES) {
    for (const r of estado[c] as Registro[]) {
      if (ehDemo(r)) continue;
      out.push({ colecao: c, id: r.id, dados: r, modificado_em: r.modificadoEm ?? r.criadoEm ?? EPOCA, excluido: false });
    }
  }
  if (estado.prefs.modificadoEm) out.push({ colecao: '_kv', id: 'prefs', dados: prefsParaNuvem(estado.prefs), modificado_em: estado.prefs.modificadoEm, excluido: false });
  if (estado.memoria.modificadoEm) out.push({ colecao: '_kv', id: 'memoria', dados: memoriaParaNuvem(estado.memoria), modificado_em: estado.memoria.modificadoEm, excluido: false });
  return out;
}

/** Aplica ao estado local as linhas que vieram do servidor. Puro: devolve um novo estado. */
export function aplicarRemotos(e: EstadoApp, linhas: LinhaRemota[]): EstadoApp {
  if (!linhas.length) return e;
  const out: EstadoApp = { ...e };
  const listas = new Map<Colecao, Registro[]>();
  const lista = (c: Colecao) => {
    if (!listas.has(c)) listas.set(c, [...(e[c] as Registro[])]);
    return listas.get(c)!;
  };

  for (const l of linhas) {
    const remoto = tempo(l.modificado_em);
    const iso = new Date(remoto || Date.now()).toISOString();

    if (l.colecao === '_kv') {
      if (l.excluido || !l.dados) continue;
      if (l.id === 'prefs' && remoto > tempo(out.prefs.modificadoEm)) {
        const d = l.dados as Partial<Preferencias>;
        const prefs: Preferencias = {
          ...out.prefs,
          consentimentoIA: typeof d.consentimentoIA === 'boolean' ? d.consentimentoIA : out.prefs.consentimentoIA,
          ocultarValores: typeof d.ocultarValores === 'boolean' ? d.ocultarValores : out.prefs.ocultarValores,
          taxas: d.taxas ?? out.prefs.taxas,
          modificadoEm: iso,
        };
        vindosDaNuvem.add(prefs);
        out.prefs = prefs;
      }
      if (l.id === 'memoria' && remoto > tempo(out.memoria.modificadoEm)) {
        const d = l.dados as Partial<MemoriaAssistente>;
        const memoria: MemoriaAssistente = {
          preferencias: Array.isArray(d.preferencias) ? d.preferencias : [],
          contexto: d.contexto ?? undefined,
          modificadoEm: iso,
        };
        vindosDaNuvem.add(memoria);
        out.memoria = memoria;
      }
      continue;
    }

    if (!(COLECOES as readonly string[]).includes(l.colecao)) continue;
    const c = l.colecao as Colecao;
    const itens = lista(c);
    const idx = itens.findIndex((r) => r.id === l.id);
    const local = idx >= 0 ? itens[idx] : undefined;
    const localT = tempo(local?.modificadoEm ?? local?.criadoEm);

    if (l.excluido) {
      if (local && localT <= remoto) {
        itens.splice(idx, 1);
        excluidosDaNuvem.add(`${c}/${l.id}`);
      }
      continue;
    }
    if (!l.dados || (local && localT >= remoto)) continue;
    const registro = { ...(l.dados as unknown as Registro), id: l.id, modificadoEm: iso };
    delete registro.demo;
    vindosDaNuvem.add(registro);
    if (idx >= 0) itens[idx] = registro; else itens.push(registro);
  }

  for (const [c, itens] of listas) {
    if (c === 'movimentacoes') (itens as EstadoApp['movimentacoes']).sort((a, b) => b.data.localeCompare(a.data));
    if (c === 'conversas') (itens as EstadoApp['conversas']).sort((a, b) => a.em.localeCompare(b.em));
    (out as unknown as Record<Colecao, Registro[]>)[c] = itens;
  }
  return out;
}
