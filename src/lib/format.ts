export const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(v) ? v : 0);

export const num = (v: number, casas = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);

export const pct = (v: number, casas = 1) => `${num(v, casas)}%`;

/** ISO (yyyy-mm-dd) -> 14/10/2026 */
export const dataBR = (iso: string) => {
  if (!iso) return '—';
  // Carimbo com hora (UTC) → data no fuso local; data pura (yyyy-mm-dd) fica como está
  const base = iso.length > 10 && iso.includes('T') && !Number.isNaN(Date.parse(iso)) ? isoLocal(new Date(iso)) : iso.slice(0, 10);
  const [a, m, d] = base.split('-');
  return `${d}/${m}/${a}`;
};

/** Data local (não UTC) no formato yyyy-mm-dd. */
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const hoje = () => isoLocal(new Date());
export const mesAtual = () => hoje().slice(0, 7);

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** '2025-04' -> 'Abril de 2025' */
export const rotuloMes = (ym: string) => {
  const [a, m] = ym.split('-');
  return `${MESES_LONGOS[Number(m) - 1]} de ${a}`;
};

export const mesDe = (iso: string) => iso.slice(0, 7);

export const mesAnterior = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const addMeses = (ym: string, n: number) => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const diasAte = (iso: string) => {
  const alvo = new Date(`${iso}T00:00:00`);
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
};

/** "1.234,56" | "R$ 1.234,56" | "1234.56" -> 1234.56 */
export const parseBRL = (s: string): number => {
  if (!s) return 0;
  const limpo = String(s).replace(/[^\d,.-]/g, '');
  if (limpo.includes(',')) return Number(limpo.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(limpo) || 0;
};

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const iniciais = (nome: string) =>
  nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const plural = (n: number, singular: string, plural_: string) =>
  `${n} ${Math.abs(n) === 1 ? singular : plural_}`;
