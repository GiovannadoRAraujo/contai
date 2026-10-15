import { describe, expect, it } from 'vitest';
import { interpretarTexto, parseValorBR } from '@/lib/leitura/interpretar';
import { hashMov } from '@/lib/finance';

const HOJE = new Date('2026-10-14T12:00:00');

const FATURA = `NUBANK
Fatura do cartão de crédito
Vencimento 20/10/2026
Total da fatura R$ 412,30
Pagamento mínimo R$ 61,85
15/09 PAGAMENTO RECEBIDO -980,00
18/09 SUPERMERCADO PAO DE ACUCAR 250,10
22/09 MP*SERVDIGITAL 89,90
25/09 NETFLIX.COM 44,90
02/10 AMAZON MARKETPLACE PARC 02/03 45,49
05/10 ESTORNO COMPRA AMAZON -18,09`;

describe('interpretarTexto — fatura de cartão', () => {
  const r = interpretarTexto(FATURA, { hoje: HOJE });

  it('identifica tipo, emissor, total e vencimento', () => {
    expect(r.documento).toBe('fatura_cartao');
    expect(r.emissor).toBe('Nubank');
    expect(r.totalDocumento).toBe(412.3);
    expect(r.vencimento).toBe('2026-10-20');
  });

  it('lê apenas as linhas de transação, não as de resumo', () => {
    expect(r.transacoes).toHaveLength(6);
    expect(r.transacoes.some((t) => /m[ií]nimo/i.test(t.descricaoOriginal))).toBe(false);
  });

  it('infere o ano a partir do vencimento', () => {
    expect(r.transacoes.find((t) => t.descricaoOriginal.includes('PAO DE ACUCAR'))?.data).toBe('2026-09-18');
  });

  it('separa o pagamento da fatura para não contar a despesa duas vezes', () => {
    const pg = r.transacoes.find((t) => t.pagamentoFatura);
    expect(pg?.status).toBe('ignorada');
    expect(pg?.valor).toBe(980);
  });

  it('reconhece estorno como entrada', () => {
    const est = r.transacoes.find((t) => t.natureza === 'estorno');
    expect(est?.tipo).toBe('receita');
    expect(est?.categoria).toBe('Estorno');
  });

  it('pergunta ao usuário quando a descrição é ambígua', () => {
    const amb = r.transacoes.find((t) => t.descricaoOriginal.includes('SERVDIGITAL'));
    expect(amb?.status).toBe('duvida');
    expect(amb?.confianca).toBeLessThan(0.6);
  });

  it('classifica por contexto e detecta parcelas', () => {
    expect(r.transacoes.find((t) => t.descricaoOriginal.includes('NETFLIX'))?.categoria).toBe('Assinaturas');
    const parc = r.transacoes.find((t) => t.descricaoOriginal.includes('AMAZON MARKETPLACE'));
    expect(parc?.parcela).toEqual({ atual: 2, total: 3 });
  });

  it('confere a soma com o total do documento', () => {
    // 250,10 + 89,90 + 44,90 + 45,49 − 18,09 = 412,30
    expect(r.avisos.some((a) => a.includes('difere do total'))).toBe(false);
  });
});

describe('interpretarTexto — regras e duplicidade', () => {
  it('usa regras aprendidas do usuário', () => {
    const r = interpretarTexto(FATURA, { hoje: HOJE, regras: { 'mp*servdigital': 'Assinaturas' } });
    const t = r.transacoes.find((x) => x.descricaoOriginal.includes('SERVDIGITAL'));
    expect(t?.categoria).toBe('Assinaturas');
    expect(t?.status).toBe('pendente');
  });

  it('marca lançamentos já existentes como duplicados', () => {
    const r1 = interpretarTexto(FATURA, { hoje: HOJE });
    const netflix = r1.transacoes.find((t) => t.descricaoOriginal.includes('NETFLIX'))!;
    const existentes = new Set([hashMov(netflix.data, netflix.valor, netflix.descricao)]);
    const r2 = interpretarTexto(FATURA, { hoje: HOJE, existentes });
    expect(r2.transacoes.find((t) => t.descricaoOriginal.includes('NETFLIX'))?.status).toBe('duplicada');
  });

  it('avisa quando a soma não bate com o total', () => {
    const r = interpretarTexto(FATURA.replace('412,30', '999,99'), { hoje: HOJE });
    expect(r.avisos.some((a) => a.includes('difere do total'))).toBe(true);
  });
});

describe('interpretarTexto — extrato e outros documentos', () => {
  it('extrato: usa o valor da transação, não a coluna de saldo, e entende C/D', () => {
    const texto = `Banco Inter - Extrato da conta
01/10/2026 SALARIO EMPRESA X 5.800,00 C 7.300,00
03/10/2026 PIX ENVIADO MARIA SILVA 150,00 D 7.150,00
04/10/2026 TARIFA PACOTE SERVICOS 29,90 D 7.120,10`;
    const r = interpretarTexto(texto, { hoje: HOJE });
    expect(r.documento).toBe('extrato');
    expect(r.transacoes).toHaveLength(3);
    const [sal, pix, tarifa] = r.transacoes;
    expect(sal).toMatchObject({ valor: 5800, tipo: 'receita', categoria: 'Salário' });
    expect(pix).toMatchObject({ valor: 150, tipo: 'despesa', natureza: 'transferencia', status: 'duvida' });
    expect(tarifa).toMatchObject({ valor: 29.9, categoria: 'Impostos e taxas' });
  });

  it('conta de consumo sem itens: usa total e vencimento encontrados', () => {
    const texto = `ENEL DISTRIBUIÇÃO SÃO PAULO
Conta de energia elétrica
Consumo 210 kWh
Vencimento 25/10/2026
Total a pagar R$ 189,90`;
    const r = interpretarTexto(texto, { hoje: HOJE });
    expect(r.documento).toBe('conta_consumo');
    expect(r.transacoes).toHaveLength(1);
    expect(r.transacoes[0]).toMatchObject({ valor: 189.9, data: '2026-10-25', categoria: 'Moradia' });
  });

  it('não inventa transações quando o texto não tem nenhuma', () => {
    const r = interpretarTexto('Documento qualquer sem valores', { hoje: HOJE });
    expect(r.transacoes).toHaveLength(0);
    expect(r.totalDocumento).toBeUndefined();
    expect(r.vencimento).toBeUndefined();
  });

  it('converte valores no padrão brasileiro', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56);
    expect(parseValorBR('0,99')).toBe(0.99);
  });
});
