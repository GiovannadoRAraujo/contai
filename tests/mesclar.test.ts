import { describe, expect, it } from 'vitest';
import { aplicarRemotos, diferencas, todasAsMudancas, type LinhaRemota } from '@/lib/nuvem/mesclar';
import { estadoVazio } from '@/lib/db';
import type { EstadoApp, Movimentacao } from '@/types';

const mov = (id: string, valor: number, modificadoEm: string, extra: Partial<Movimentacao> = {}): Movimentacao => ({
  id, tipo: 'despesa', descricao: `Mov ${id}`, valor, data: '2026-10-10', categoria: 'Outros', contaId: 'c', origem: 'manual',
  criadoEm: modificadoEm, modificadoEm, ...extra,
});
const com = (movs: Movimentacao[]): EstadoApp => ({ ...estadoVazio(), movimentacoes: movs });
const linha = (id: string, valor: number | null, em: string, excluido = false): LinhaRemota => ({
  colecao: 'movimentacoes', id, modificado_em: em, excluido,
  dados: valor === null ? null : (mov(id, valor, em) as unknown as Record<string, unknown>),
});

describe('aplicarRemotos', () => {
  it('insere registros novos vindos de outro aparelho', () => {
    const e = aplicarRemotos(com([]), [linha('a', 10, '2026-10-01T10:00:00+00:00')]);
    expect(e.movimentacoes.map((m) => m.id)).toEqual(['a']);
  });

  it('a alteração mais recente vence, comparando datas e não textos', () => {
    const local = com([mov('a', 10, '2026-10-01T12:00:00.000Z')]);
    // 13:00 em outro fuso é mais antigo que 12:00Z
    const r1 = aplicarRemotos(local, [linha('a', 99, '2026-10-01T13:00:00-03:00')]);
    expect(r1.movimentacoes[0].valor).toBe(99); // 16:00Z > 12:00Z
    const r2 = aplicarRemotos(local, [linha('a', 77, '2026-10-01T08:00:00-03:00')]);
    expect(r2.movimentacoes[0].valor).toBe(10); // 11:00Z < 12:00Z
  });

  it('exclusões remotas removem só se forem mais recentes', () => {
    const local = com([mov('a', 10, '2026-10-01T12:00:00Z')]);
    expect(aplicarRemotos(local, [linha('a', null, '2026-10-01T13:00:00Z', true)]).movimentacoes).toHaveLength(0);
    expect(aplicarRemotos(local, [linha('a', null, '2026-10-01T11:00:00Z', true)]).movimentacoes).toHaveLength(1);
  });

  it('aplica preferências e memória do assistente sem tocar em campos do aparelho', () => {
    const local = estadoVazio();
    local.prefs = { ...local.prefs, consentimentoEnvioExterno: true, avisoPrivacidadeVisto: true, ocultarValores: false, modificadoEm: '2026-10-01T00:00:00Z' };
    const e = aplicarRemotos(local, [
      { colecao: '_kv', id: 'prefs', excluido: false, modificado_em: '2026-10-02T00:00:00Z', dados: { ocultarValores: true, consentimentoIA: false } },
      { colecao: '_kv', id: 'memoria', excluido: false, modificado_em: '2026-10-02T00:00:00Z', dados: { preferencias: [{ id: 'p', texto: 'salário dia 5', em: '2026-10-02' }] } },
    ]);
    expect(e.prefs.ocultarValores).toBe(true);
    expect(e.prefs.consentimentoIA).toBe(false);
    expect(e.prefs.consentimentoEnvioExterno).toBe(true); // não sincroniza
    expect(e.prefs.avisoPrivacidadeVisto).toBe(true);     // não sincroniza
    expect(e.memoria.preferencias[0].texto).toBe('salário dia 5');
  });
});

describe('diferencas', () => {
  it('detecta inclusões, alterações e exclusões', () => {
    const a = mov('a', 1, '2026-10-01T00:00:00Z');
    const b = mov('b', 2, '2026-10-01T00:00:00Z');
    const antes = com([a, b]);
    const depois = com([{ ...a, valor: 5, modificadoEm: '2026-10-02T00:00:00Z' }, mov('c', 3, '2026-10-02T00:00:00Z')]);
    const d = diferencas(antes, depois, '2026-10-03T00:00:00.000Z');
    expect(d.map((x) => `${x.id}:${x.excluido}`).sort()).toEqual(['a:false', 'b:true', 'c:false']);
    expect(d.find((x) => x.id === 'b')?.modificado_em).toBe('2026-10-03T00:00:00.000Z');
  });

  it('não reenvia o que acabou de chegar da nuvem (sem eco)', () => {
    const antes = com([mov('a', 1, '2026-10-01T00:00:00Z')]);
    const depois = aplicarRemotos(antes, [linha('a', 9, '2026-10-05T00:00:00Z'), linha('n', 4, '2026-10-05T00:00:00Z')]);
    expect(diferencas(antes, depois)).toHaveLength(0);
    const sem = aplicarRemotos(depois, [linha('n', null, '2026-10-06T00:00:00Z', true)]);
    expect(diferencas(depois, sem)).toHaveLength(0); // exclusão remota não vira novo tombstone
  });

  it('nunca envia dados de demonstração', () => {
    const antes = com([]);
    const depois = com([mov('demo-x', 1, '2026-10-01T00:00:00Z', { demo: true })]);
    expect(diferencas(antes, depois)).toHaveLength(0);
    expect(todasAsMudancas(depois)).toHaveLength(0);
  });

  it('envia preferências só quando um campo compartilhado muda', () => {
    const antes = estadoVazio();
    const soLocal = { ...antes, prefs: { ...antes.prefs, avisoPrivacidadeVisto: true } };
    expect(diferencas(antes, soLocal)).toHaveLength(0);
    const compartilhado = { ...antes, prefs: { ...antes.prefs, ocultarValores: true, modificadoEm: '2026-10-02T00:00:00Z' } };
    expect(diferencas(antes, compartilhado).map((x) => x.id)).toEqual(['prefs']);
  });
});
