import type { EstadoApp, Movimentacao, TipoMov } from '@/types';
import { addMeses, isoLocal, mesAtual, uid } from '@/lib/format';

/**
 * Base de demonstração do contAI — dados FICTÍCIOS.
 * Só é carregada quando o usuário pede. Todos os registros recebem
 * `demo: true` e ids com prefixo `demo-`, para serem identificados na
 * interface e removidos de uma vez sem tocar nos dados reais.
 * Os dados são gerados em relação ao mês corrente para que vencimentos,
 * alertas e comparativos mensais façam sentido em qualquer data.
 * Nenhum dado bancário real é utilizado.
 */

const dia = (ym: string, d: number) => `${ym}-${String(d).padStart(2, '0')}`;
const emDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

type L = [dia: number, tipo: TipoMov, descricao: string, valor: number, categoria: string, conta: string];

const M0: L[] = [
  [5, 'receita', 'Salário — Mensal', 5800.0, 'Salário', 'c1'],
  [12, 'receita', 'Projeto freelance — landing page', 850.0, 'Freelance', 'c1'],
  [1, 'receita', 'Rendimento conta remunerada', 200.0, 'Rendimentos', 'c1'],
  [5, 'despesa', 'Aluguel do apartamento', 950.0, 'Moradia', 'c1'],
  [5, 'despesa', 'Condomínio', 126.56, 'Moradia', 'c1'],
  [9, 'despesa', 'Enel — conta de luz', 189.9, 'Moradia', 'c1'],
  [3, 'despesa', 'Pão de Açúcar — compras do mês', 412.8, 'Alimentação', 'c4'],
  [8, 'despesa', 'iFood', 139.7, 'Alimentação', 'c4'],
  [11, 'despesa', 'Padaria Bella Vista', 59.89, 'Alimentação', 'c3'],
  [14, 'despesa', 'Restaurante Nonna', 100.0, 'Alimentação', 'c4'],
  [2, 'despesa', 'Posto Shell — combustível', 280.0, 'Transporte', 'c4'],
  [7, 'despesa', 'Uber (6 corridas)', 154.92, 'Transporte', 'c4'],
  [13, 'despesa', 'Estacionamento mensal', 40.0, 'Transporte', 'c3'],
  [6, 'despesa', 'Cinema Cinemark', 78.0, 'Lazer', 'c4'],
  [15, 'despesa', 'Ingresso show — Allianz', 220.0, 'Lazer', 'c5'],
  [10, 'despesa', 'Bar do Juca', 97.77, 'Lazer', 'c3'],
  [4, 'despesa', 'Drogasil', 126.62, 'Saúde', 'c4'],
  [10, 'despesa', 'Unimed — coparticipação', 190.0, 'Saúde', 'c1'],
  [6, 'despesa', 'Alura — assinatura anual (parcela)', 97.46, 'Educação', 'c5'],
  [8, 'despesa', 'Curso de inglês', 140.0, 'Educação', 'c1'],
  [15, 'despesa', 'Netflix', 44.9, 'Assinaturas', 'c4'],
  [10, 'despesa', 'Spotify Premium', 21.9, 'Assinaturas', 'c4'],
  [20, 'despesa', 'Vivo — internet e celular', 119.9, 'Serviços', 'c1'],
  [12, 'despesa', 'Amazon — eletrônicos', 320.0, 'Compras', 'c5'],
  [1, 'despesa', 'Tarifa de manutenção', 47.38, 'Impostos e taxas', 'c2'],
];

const M1: L[] = [
  [5, 'receita', 'Salário — Mensal', 5800.0, 'Salário', 'c1'],
  [14, 'receita', 'Freelance — consultoria', 420.0, 'Freelance', 'c1'],
  [1, 'receita', 'Rendimento conta remunerada', 122.6, 'Rendimentos', 'c1'],
  [5, 'despesa', 'Aluguel do apartamento', 950.0, 'Moradia', 'c1'],
  [5, 'despesa', 'Condomínio', 126.56, 'Moradia', 'c1'],
  [9, 'despesa', 'Enel — conta de luz', 204.3, 'Moradia', 'c1'],
  [3, 'despesa', 'Carrefour — compras do mês', 520.4, 'Alimentação', 'c4'],
  [11, 'despesa', 'iFood', 210.9, 'Alimentação', 'c4'],
  [18, 'despesa', 'Restaurante — almoços', 280.0, 'Alimentação', 'c4'],
  [7, 'despesa', 'Uber', 198.3, 'Transporte', 'c4'],
  [2, 'despesa', 'Posto Ipiranga', 300.0, 'Transporte', 'c4'],
  [4, 'despesa', 'Droga Raia', 88.7, 'Saúde', 'c4'],
  [15, 'despesa', 'Netflix', 44.9, 'Assinaturas', 'c4'],
  [10, 'despesa', 'Spotify Premium', 21.9, 'Assinaturas', 'c4'],
  [20, 'despesa', 'Vivo — internet e celular', 119.9, 'Serviços', 'c1'],
  [12, 'despesa', 'Amazon — casa e decoração', 410.0, 'Compras', 'c5'],
  [6, 'despesa', 'Cinema', 96.0, 'Lazer', 'c4'],
  [8, 'despesa', 'Curso de inglês', 140.0, 'Educação', 'c1'],
  [1, 'despesa', 'Tarifa de manutenção', 47.38, 'Impostos e taxas', 'c2'],
  [22, 'despesa', 'Magalu — presente', 406.76, 'Compras', 'c5'],
];

const M2: L[] = [
  [5, 'receita', 'Salário — Mensal', 5800.0, 'Salário', 'c1'],
  [14, 'receita', 'Freelance — design', 500.0, 'Freelance', 'c1'],
  [1, 'receita', 'Rendimento conta remunerada', 120.0, 'Rendimentos', 'c1'],
  [5, 'despesa', 'Aluguel do apartamento', 950.0, 'Moradia', 'c1'],
  [5, 'despesa', 'Condomínio', 126.56, 'Moradia', 'c1'],
  [9, 'despesa', 'Enel — conta de luz', 232.1, 'Moradia', 'c1'],
  [3, 'despesa', 'Supermercado Assaí', 610.2, 'Alimentação', 'c4'],
  [11, 'despesa', 'iFood', 265.4, 'Alimentação', 'c4'],
  [7, 'despesa', 'Transporte — Uber e combustível', 420.0, 'Transporte', 'c4'],
  [4, 'despesa', 'Consulta e exames', 310.0, 'Saúde', 'c1'],
  [15, 'despesa', 'Assinaturas digitais', 66.8, 'Assinaturas', 'c4'],
  [20, 'despesa', 'Vivo — internet e celular', 119.9, 'Serviços', 'c1'],
  [12, 'despesa', 'Compras diversas', 980.3, 'Compras', 'c5'],
  [6, 'despesa', 'Lazer e saídas', 540.0, 'Lazer', 'c4'],
  [8, 'despesa', 'Curso de inglês', 140.0, 'Educação', 'c1'],
  [24, 'despesa', 'Hotel — viagem de feriado', 301.36, 'Lazer', 'c5'],
  [1, 'despesa', 'Tarifa de manutenção', 47.38, 'Impostos e taxas', 'c2'],
];

const M3: L[] = [
  [5, 'receita', 'Salário — Mensal', 5800.0, 'Salário', 'c1'],
  [14, 'receita', 'Freelance — manutenção de site', 300.0, 'Freelance', 'c1'],
  [5, 'despesa', 'Aluguel do apartamento', 950.0, 'Moradia', 'c1'],
  [5, 'despesa', 'Condomínio', 126.56, 'Moradia', 'c1'],
  [9, 'despesa', 'Enel — conta de luz', 198.4, 'Moradia', 'c1'],
  [3, 'despesa', 'Supermercado', 580.1, 'Alimentação', 'c4'],
  [11, 'despesa', 'iFood', 188.9, 'Alimentação', 'c4'],
  [7, 'despesa', 'Transporte', 390.0, 'Transporte', 'c4'],
  [4, 'despesa', 'Dentista', 420.0, 'Saúde', 'c1'],
  [15, 'despesa', 'Assinaturas digitais', 66.8, 'Assinaturas', 'c4'],
  [20, 'despesa', 'Vivo — internet e celular', 119.9, 'Serviços', 'c1'],
  [12, 'despesa', 'Compras de fim de ano', 1240.6, 'Compras', 'c5'],
  [6, 'despesa', 'Lazer e saídas', 680.0, 'Lazer', 'c4'],
  [8, 'despesa', 'Curso de inglês', 140.0, 'Educação', 'c1'],
  [10, 'despesa', 'IPVA — parcela', 791.36, 'Impostos e taxas', 'c1'],
  [1, 'despesa', 'Tarifa de manutenção', 47.38, 'Impostos e taxas', 'c2'],
];

function montar(linhas: L[], ym: string): Movimentacao[] {
  return linhas.map(([d, tipo, descricao, valor, categoria, contaId]) => ({
    id: `demo-${uid()}`,
    tipo,
    descricao,
    valor,
    data: dia(ym, d),
    categoria,
    contaId: `demo-${contaId}`,
    origem: 'manual' as const,
    demo: true,
  }));
}

export type ColecoesDemo = Pick<
  EstadoApp,
  'contas' | 'movimentacoes' | 'faturas' | 'investimentos' | 'metas' | 'orcamentos' | 'recorrentes'
>;

export function dadosDemo(): ColecoesDemo {
  const atual = mesAtual();
  const movimentacoes = [
    ...montar(M0, atual),
    ...montar(M1, addMeses(atual, -1)),
    ...montar(M2, addMeses(atual, -2)),
    ...montar(M3, addMeses(atual, -3)),
  ].sort((a, b) => b.data.localeCompare(a.data));

  const d = { demo: true as const };
  return {
    contas: [
      { id: 'demo-c1', nome: 'Banco Exemplo', tipo: 'corrente', saldoInicial: 12455.9, cor: '#8B5CF6', ...d },
      { id: 'demo-c2', nome: 'Conta Reserva', tipo: 'corrente', saldoInicial: 6000.0, cor: '#FF9F43', ...d },
      { id: 'demo-c3', nome: 'Carteira', tipo: 'carteira', saldoInicial: 2000.0, cor: '#2DE2A6', ...d },
      { id: 'demo-c4', nome: 'Cartão Roxo', tipo: 'cartao', saldoInicial: 0, limite: 1800, cor: '#8B5CF6', ...d },
      { id: 'demo-c5', nome: 'Cartão Laranja', tipo: 'cartao', saldoInicial: 0, limite: 3000, cor: '#FF9F43', ...d },
    ],
    movimentacoes,
    faturas: [
      { id: 'demo-f1', contaId: 'demo-c4', emissor: 'Cartão Roxo', referencia: 'Fatura do cartão', valor: 1240.0, vencimento: emDias(11), status: 'pendente', cor: '#8B5CF6', sigla: 'cr', paginas: 3, ...d },
      { id: 'demo-f2', contaId: 'demo-c5', emissor: 'Cartão Laranja', referencia: 'Fatura do cartão', valor: 892.45, vencimento: emDias(4), status: 'pendente', cor: '#FF9F43', sigla: 'cl', paginas: 2, ...d },
      { id: 'demo-f3', emissor: 'Telefonia Exemplo', referencia: 'Telefonia móvel', valor: 159.9, vencimento: emDias(6), status: 'em_analise', cor: '#F052A0', sigla: 'tel', paginas: 1, ...d },
      { id: 'demo-f4', emissor: 'Energia Exemplo', referencia: 'Conta de luz', valor: 189.9, vencimento: emDias(3), status: 'pendente', cor: '#FF9F43', sigla: 'luz', paginas: 1, ...d },
      { id: 'demo-f5', emissor: 'Loja Exemplo', referencia: 'Compra parcelada', valor: 320.0, vencimento: emDias(-3), status: 'paga', cor: '#27D9D0', sigla: 'lj', paginas: 1, ...d },
    ],
    investimentos: [
      { id: 'demo-i1', nome: 'Tesouro Selic 2029', modalidade: 'Tesouro Direto', valorInvestido: 5000, rentabilidade: 8.24, atualizadoEm: emDias(-2), ativo: true, ...d },
      { id: 'demo-i2', nome: 'CDB 110% do CDI', modalidade: 'CDB', valorInvestido: 2470, rentabilidade: 8.75, atualizadoEm: emDias(-2), ativo: true, ...d },
      { id: 'demo-i3', nome: 'Fundo Multimercado Exemplo', modalidade: 'Fundos', valorInvestido: 1494, rentabilidade: 6.1, atualizadoEm: emDias(-5), ativo: true, ...d },
      { id: 'demo-i4', nome: 'Ação EXMP3 (fictícia)', modalidade: 'Ações', valorInvestido: 2490, rentabilidade: 12.3, atualizadoEm: emDias(-1), ativo: true, ...d },
      { id: 'demo-i5', nome: 'ETF DEMO11 (fictício)', modalidade: 'ETFs', valorInvestido: 996, rentabilidade: 15.4, atualizadoEm: emDias(-1), ativo: true, ...d },
    ],
    metas: [
      { id: 'demo-me1', nome: 'Viagem dos sonhos', alvo: 6000, atual: 3200, prazo: `${addMeses(atual, 8)}-01`, cor: '#A855F7', ...d },
      { id: 'demo-me2', nome: 'Reserva de emergência', alvo: 15000, atual: 9200, prazo: `${addMeses(atual, 12)}-01`, cor: '#27D9D0', ...d },
      { id: 'demo-me3', nome: 'Notebook novo', alvo: 5000, atual: 5000, prazo: `${addMeses(atual, 1)}-01`, cor: '#2DE2A6', ...d },
    ],
    orcamentos: ([
      ['Moradia', 1400], ['Alimentação', 900], ['Transporte', 600], ['Lazer', 400],
      ['Saúde', 350], ['Educação', 300], ['Compras', 500],
    ] as Array<[string, number]>).map(([categoria, limite]) => ({ id: categoria, categoria, limite, ...d })),
    recorrentes: [
      { id: 'demo-r1', descricao: 'Aluguel do apartamento', valor: 950, diaVencimento: 5, tipo: 'despesa', categoria: 'Moradia', ativo: true, ...d },
      { id: 'demo-r2', descricao: 'Condomínio', valor: 126.56, diaVencimento: 5, tipo: 'despesa', categoria: 'Moradia', ativo: true, ...d },
      { id: 'demo-r3', descricao: 'Netflix', valor: 44.9, diaVencimento: 15, tipo: 'despesa', categoria: 'Assinaturas', ativo: true, ...d },
      { id: 'demo-r4', descricao: 'Spotify Premium', valor: 21.9, diaVencimento: 10, tipo: 'despesa', categoria: 'Assinaturas', ativo: true, ...d },
      { id: 'demo-r5', descricao: 'Internet e celular', valor: 119.9, diaVencimento: 20, tipo: 'despesa', categoria: 'Serviços', ativo: true, ...d },
      { id: 'demo-r6', descricao: 'Salário', valor: 5800, diaVencimento: 5, tipo: 'receita', categoria: 'Salário', ativo: true, ...d },
    ],
  };
}
