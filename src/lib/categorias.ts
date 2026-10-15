export const CATEGORIAS_DESPESA = [
  'Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer',
  'Compras', 'Assinaturas', 'Serviços', 'Impostos e taxas', 'Investimentos',
  'Transferências', 'Outros',
] as const;

export const CATEGORIAS_RECEITA = [
  'Salário', 'Freelance', 'Rendimentos', 'Reembolso', 'Estorno', 'Transferências', 'Outros',
] as const;

export const COR_CATEGORIA: Record<string, string> = {
  'Moradia': '#8B5CF6',
  'Alimentação': '#27D9D0',
  'Transporte': '#F052A0',
  'Lazer': '#FF9F43',
  'Saúde': '#2DE2A6',
  'Educação': '#A855F7',
  'Compras': '#60A5FA',
  'Assinaturas': '#F472B6',
  'Serviços': '#38BDF8',
  'Impostos e taxas': '#FBBF24',
  'Investimentos': '#34D399',
  'Transferências': '#818CF8',
  'Salário': '#2DE2A6',
  'Freelance': '#27D9D0',
  'Rendimentos': '#A855F7',
  'Reembolso': '#60A5FA',
  'Estorno': '#FBBF24',
  // Classes e modalidades de investimento
  'Renda fixa': '#8B5CF6',
  'Tesouro Direto': '#A855F7',
  'CDB': '#7C3AED',
  'LCI/LCA': '#60A5FA',
  'Fundos': '#FF9F43',
  'Ações': '#27D9D0',
  'ETFs': '#F052A0',
  'Outros': '#697795',
};

export const corCategoria = (c: string) => COR_CATEGORIA[c] ?? '#7C3AED';

/** Palavras-chave usadas pelo classificador de documentos (camada de demonstração). */
export const DICIONARIO: Array<{ categoria: string; termos: string[] }> = [
  { categoria: 'Alimentação', termos: ['ifood', 'rappi', 'restaurante', 'padaria', 'mercado', 'supermercado', 'pao de acucar', 'carrefour', 'assai', 'burger', 'pizza', 'lanche', 'cafe', 'starbucks', 'hortifruti'] },
  { categoria: 'Transporte', termos: ['uber', '99app', '99 pop', 'posto', 'combustivel', 'shell', 'ipiranga', 'petrobras', 'estacionamento', 'metro', 'cptm', 'bilhete unico', 'pedagio'] },
  { categoria: 'Moradia', termos: ['aluguel', 'condominio', 'enel', 'light', 'cemig', 'copel', 'sabesp', 'comgas', 'energia', 'agua', 'gas', 'iptu'] },
  { categoria: 'Assinaturas', termos: ['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'max', 'youtube premium', 'icloud', 'google one', 'microsoft 365', 'adobe', 'chatgpt', 'claude'] },
  { categoria: 'Saúde', termos: ['farmacia', 'drogaria', 'droga raia', 'drogasil', 'unimed', 'amil', 'hospital', 'laboratorio', 'clinica', 'dentista', 'psicolog'] },
  { categoria: 'Educação', termos: ['faculdade', 'curso', 'udemy', 'alura', 'escola', 'livraria', 'coursera', 'mensalidade escolar'] },
  { categoria: 'Lazer', termos: ['cinema', 'ingresso', 'show', 'bar ', 'pub', 'viagem', 'hotel', 'airbnb', 'booking', 'latam', 'gol linhas', 'azul via'] },
  { categoria: 'Compras', termos: ['amazon', 'mercado livre', 'magalu', 'americanas', 'shopee', 'aliexpress', 'renner', 'zara', 'centauro', 'kabum'] },
  { categoria: 'Serviços', termos: ['vivo', 'claro', 'tim ', 'oi fibra', 'internet', 'telefon', 'lavanderia', 'manutencao'] },
  { categoria: 'Impostos e taxas', termos: ['iof', 'tarifa', 'anuidade', 'juros', 'multa', 'darf', 'ipva', 'licenciamento'] },
  { categoria: 'Investimentos', termos: ['tesouro', 'cdb', 'lci', 'lca', 'corretora', 'xp invest', 'rico invest', 'clear corret', 'nuinvest'] },
  { categoria: 'Transferências', termos: ['pix enviado', 'pix recebido', 'ted', 'doc ', 'transferencia'] },
];

export const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Categorias padrão + categorias criadas pelo usuário, sem repetição. */
export function nomesCategorias(
  personalizadas: Array<{ nome: string; tipo: 'receita' | 'despesa' }>,
  tipo?: 'receita' | 'despesa',
): string[] {
  const base: readonly string[] =
    tipo === 'receita' ? CATEGORIAS_RECEITA
      : tipo === 'despesa' ? CATEGORIAS_DESPESA
        : [...CATEGORIAS_DESPESA, ...CATEGORIAS_RECEITA];
  const extras = personalizadas.filter((c) => !tipo || c.tipo === tipo).map((c) => c.nome);
  return [...new Set([...base, ...extras])];
}

/** Regras aprendidas no formato usado pelo classificador (padrão -> categoria). */
export const mapaRegras = (regras: Array<{ padrao: string; categoria: string }>) =>
  Object.fromEntries(regras.map((r) => [r.padrao, r.categoria]));
