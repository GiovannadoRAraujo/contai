import { describe, expect, it } from 'vitest';
import { aliquotaIR, simular, type ParametrosSimulacao } from '@/lib/simulador';
import { TAXAS_REFERENCIA } from '@/lib/taxas';

const base: ParametrosSimulacao = {
  indexador: 'CDI', valorInicial: 5000, aporteMensal: 0, meses: 12, taxaAnual: 0,
  percentualIndexador: 100, isentoIR: false, taxaCustodiaAnual: 0,
};
const taxas = { ...TAXAS_REFERENCIA, CDI: { ...TAXAS_REFERENCIA.CDI, valor: 10 } };

describe('simulador', () => {
  it('R$ 5.000 a 100% do CDI (10% a.a.) por 12 meses', () => {
    const r = simular(base, taxas);
    expect(r.taxaAnualEfetiva).toBe(10);
    expect(r.montanteBruto).toBeCloseTo(5500, 1);
    expect(r.rendimentoBruto).toBeCloseTo(500, 1);
    // 12 meses ≈ 365 dias → alíquota de 17,5% (acima de 360 dias)
    expect(r.aliquotaIR).toBe(17.5);
    expect(r.impostoIR).toBeCloseTo(87.5, 1);
    expect(r.patrimonioFinal).toBeCloseTo(5412.5, 1);
  });

  it('percentual do CDI é aplicado sobre a taxa', () => {
    expect(simular({ ...base, percentualIndexador: 110 }, taxas).taxaAnualEfetiva).toBeCloseTo(11, 6);
  });

  it('IPCA+ compõe inflação e taxa real', () => {
    const t = { ...TAXAS_REFERENCIA, IPCA: { ...TAXAS_REFERENCIA.IPCA, valor: 4 } };
    expect(simular({ ...base, indexador: 'IPCA+', taxaAnual: 6 }, t).taxaAnualEfetiva).toBeCloseTo(10.24, 6);
  });

  it('isento de IR não desconta imposto', () => {
    const r = simular({ ...base, isentoIR: true }, taxas);
    expect(r.impostoIR).toBe(0);
    expect(r.patrimonioFinal).toBeCloseTo(r.montanteBruto, 2);
  });

  it('aportes são tributados pelo próprio prazo', () => {
    const r = simular({ ...base, valorInicial: 0, aporteMensal: 100, meses: 12 }, taxas);
    expect(r.totalAportado).toBe(1100); // 11 aportes ao fim dos meses 1..11
    expect(r.aliquotasIR).toEqual([22.5, 20]); // até 180 dias e até 360 dias
  });

  it('custódia reduz o patrimônio final', () => {
    const sem = simular(base, taxas);
    const com = simular({ ...base, taxaCustodiaAnual: 0.2 }, taxas);
    expect(com.custodia).toBeGreaterThan(0);
    expect(com.patrimonioFinal).toBeLessThan(sem.patrimonioFinal);
  });

  it('tabela regressiva do IR', () => {
    expect([aliquotaIR(100), aliquotaIR(200), aliquotaIR(500), aliquotaIR(900)]).toEqual([22.5, 20, 17.5, 15]);
  });
});
