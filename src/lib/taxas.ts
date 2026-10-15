import type { Preferencias, TaxaObtida } from '@/types';

/**
 * Fonte de taxas de referência para o simulador.
 *
 * Integração real e sem credenciais com o Sistema Gerenciador de Séries
 * Temporais (SGS) do Banco Central do Brasil — API pública. Só os códigos das
 * séries são enviados; nenhum dado do usuário sai do navegador.
 *   432   — Meta Selic definida pelo Copom (% a.a.)
 *   4389  — Taxa DI (CDI) anualizada, base 252 (% a.a.)
 *   13522 — IPCA acumulado em 12 meses (%)
 *
 * Sem acesso à API, o app usa os valores de REFERÊNCIA abaixo, claramente
 * identificados como armazenados no código, e o usuário pode informar a taxa
 * manualmente.
 */

export type ChaveTaxa = 'CDI' | 'SELIC' | 'IPCA';

export interface TaxaEmUso {
  valor: number;
  fonte: string;
  data: string;            // data de referência do dado
  origem: 'bcb' | 'referencia' | 'manual';
  obtidaEm?: string;
}

/** Valores armazenados no código (fallback). Podem estar desatualizados. */
export const TAXAS_REFERENCIA: Record<ChaveTaxa, TaxaEmUso> = {
  CDI: { valor: 10.65, fonte: 'Valor de referência armazenado no app (B3 — taxa DI)', data: '2025-04-15', origem: 'referencia' },
  SELIC: { valor: 10.75, fonte: 'Valor de referência armazenado no app (BCB — meta Selic)', data: '2025-04-15', origem: 'referencia' },
  IPCA: { valor: 4.5, fonte: 'Valor de referência armazenado no app (IBGE — IPCA 12 meses)', data: '2025-04-15', origem: 'referencia' },
};

const SERIES: Record<ChaveTaxa, { codigo: number; fonte: string }> = {
  SELIC: { codigo: 432, fonte: 'Banco Central do Brasil — SGS 432 (meta Selic)' },
  CDI: { codigo: 4389, fonte: 'Banco Central do Brasil — SGS 4389 (taxa DI anualizada)' },
  IPCA: { codigo: 13522, fonte: 'Banco Central do Brasil — SGS 13522 (IPCA 12 meses)' },
};

/** Taxas em uso: as obtidas do BCB (se houver) ou as de referência. */
export function taxasAtuais(prefs?: Preferencias): Record<ChaveTaxa, TaxaEmUso> {
  const out = { ...TAXAS_REFERENCIA };
  for (const k of Object.keys(out) as ChaveTaxa[]) {
    const t = prefs?.taxas?.[k];
    if (t && Number.isFinite(t.valor)) out[k] = { ...t, origem: 'bcb' };
  }
  return out;
}

async function serie(codigo: number, sinal: AbortSignal): Promise<{ valor: number; data: string }> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`;
  const resp = await fetch(url, { signal: sinal, headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = (await resp.json()) as Array<{ data: string; valor: string }>;
  const ultimo = json?.[0];
  const valor = Number(String(ultimo?.valor).replace(',', '.'));
  if (!ultimo || !Number.isFinite(valor)) throw new Error('resposta inesperada');
  const [d, m, a] = ultimo.data.split('/');
  return { valor, data: `${a}-${m}-${d}` };
}

/** Consulta as três séries no BCB. Lança erro se nenhuma puder ser obtida. */
export async function buscarTaxasBCB(): Promise<Partial<Record<ChaveTaxa, TaxaObtida>>> {
  const controle = new AbortController();
  const timer = window.setTimeout(() => controle.abort(), 12000);
  const obtidaEm = new Date().toISOString();
  try {
    const chaves = Object.keys(SERIES) as ChaveTaxa[];
    const resultados = await Promise.allSettled(chaves.map((k) => serie(SERIES[k].codigo, controle.signal)));
    const out: Partial<Record<ChaveTaxa, TaxaObtida>> = {};
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') out[chaves[i]] = { ...r.value, fonte: SERIES[chaves[i]].fonte, obtidaEm };
    });
    if (!Object.keys(out).length) {
      const motivo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      throw new Error(motivo?.reason instanceof Error ? motivo.reason.message : 'sem resposta');
    }
    return out;
  } finally {
    window.clearTimeout(timer);
  }
}
