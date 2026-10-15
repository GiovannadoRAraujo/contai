import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  Categoria, Colecao, Conta, Correcao, Documento, EstadoApp, Fatura, Investimento, MemoriaAssistente,
  Mensagem, Meta, Movimentacao, Orcamento, Preferencias, Recorrente, Registro, RegraCategoria,
} from '@/types';
import { COLECOES } from '@/types';
import { dadosDemo } from '@/data/demo';
import { uid } from '@/lib/format';
import * as db from '@/lib/db';
import { aplicarRemotos, PREFS_SINCRONIZADAS, type LinhaRemota } from '@/lib/nuvem/mesclar';

export type Acao =
  | { t: 'carregar'; estado: EstadoApp }
  | { t: 'prefs'; dados: Partial<Preferencias> }
  | { t: 'mov.add'; movs: Movimentacao[] }
  | { t: 'mov.upd'; mov: Movimentacao }
  | { t: 'mov.del'; id: string }
  | { t: 'conta.add'; conta: Conta }
  | { t: 'conta.upd'; conta: Conta }
  | { t: 'conta.del'; id: string }
  | { t: 'fatura.add'; fatura: Fatura }
  | { t: 'fatura.upd'; fatura: Fatura }
  | { t: 'fatura.del'; id: string }
  | { t: 'doc.add'; doc: Documento }
  | { t: 'doc.del'; id: string }
  | { t: 'inv.add'; inv: Investimento }
  | { t: 'inv.upd'; inv: Investimento }
  | { t: 'inv.del'; id: string }
  | { t: 'meta.add'; meta: Meta }
  | { t: 'meta.upd'; meta: Meta }
  | { t: 'meta.del'; id: string }
  | { t: 'orc.set'; orc: Omit<Orcamento, 'id'> }
  | { t: 'orc.del'; categoria: string }
  | { t: 'rec.add'; rec: Recorrente }
  | { t: 'rec.upd'; rec: Recorrente }
  | { t: 'rec.del'; id: string }
  | { t: 'categoria.add'; nome: string; tipo: 'receita' | 'despesa' }
  | { t: 'categoria.del'; id: string }
  | { t: 'regra.add'; padrao: string; categoria: string; origem: RegraCategoria['origem'] }
  | { t: 'regra.del'; id: string }
  | { t: 'correcao.add'; correcao: Omit<Correcao, 'id' | 'em'> }
  | { t: 'chat.add'; msg: Mensagem }
  | { t: 'chat.limpar' }
  | { t: 'memoria'; dados: Partial<MemoriaAssistente> }
  | { t: 'memoria.limpar' }
  | { t: 'demo.carregar' }
  | { t: 'demo.remover' }
  | { t: 'sync.aplicar'; linhas: LinhaRemota[] };

const agora = () => new Date().toISOString();

/** Carimba criação/modificação. Preserva `criadoEm` de registros existentes. */
function novo<T extends Registro>(r: T): T {
  const t = agora();
  return { ...r, criadoEm: r.criadoEm ?? t, modificadoEm: t };
}
function alterado<T extends Registro>(lista: T[], r: T): T[] {
  return lista.map((x) => (x.id === r.id ? { ...r, criadoEm: x.criadoEm, modificadoEm: agora() } : x));
}
const sem = <T extends Registro>(lista: T[], id: string) => lista.filter((x) => x.id !== id);
const porData = (a: Movimentacao, b: Movimentacao) => b.data.localeCompare(a.data);

function reducer(e: EstadoApp, a: Acao): EstadoApp {
  switch (a.t) {
    case 'carregar':
      return a.estado;
    case 'prefs': {
      // Só os campos compartilhados entre aparelhos contam como alteração sincronizável
      const sincronizada = PREFS_SINCRONIZADAS.some((k) => k in a.dados && a.dados[k] !== e.prefs[k]);
      return { ...e, prefs: { ...e.prefs, ...a.dados, ...(sincronizada ? { modificadoEm: agora() } : {}) } };
    }

    case 'mov.add':
      return { ...e, movimentacoes: [...a.movs.map(novo), ...e.movimentacoes].sort(porData) };
    case 'mov.upd': {
      const antes = e.movimentacoes.find((m) => m.id === a.mov.id);
      let correcoes = e.correcoes;
      // Corrigir a categoria de um lançamento importado vira memória de correção
      if (antes && antes.categoria !== a.mov.categoria && antes.origem !== 'manual') {
        correcoes = [...correcoes, novo({ id: uid(), descricao: a.mov.descricao, de: antes.categoria, para: a.mov.categoria, em: agora() })];
      }
      return { ...e, correcoes, movimentacoes: alterado(e.movimentacoes, a.mov).sort(porData) };
    }
    case 'mov.del':
      return { ...e, movimentacoes: sem(e.movimentacoes, a.id) };

    case 'conta.add':
      return { ...e, contas: [...e.contas, novo(a.conta)] };
    case 'conta.upd':
      return { ...e, contas: alterado(e.contas, a.conta) };
    case 'conta.del':
      return { ...e, contas: sem(e.contas, a.id) };

    case 'fatura.add':
      return { ...e, faturas: [novo(a.fatura), ...e.faturas] };
    case 'fatura.upd':
      return { ...e, faturas: alterado(e.faturas, a.fatura) };
    case 'fatura.del':
      return { ...e, faturas: sem(e.faturas, a.id) };

    case 'doc.add':
      return { ...e, documentos: [novo(a.doc), ...sem(e.documentos, a.doc.id)] };
    case 'doc.del':
      return { ...e, documentos: sem(e.documentos, a.id) };

    case 'inv.add':
      return { ...e, investimentos: [novo(a.inv), ...e.investimentos] };
    case 'inv.upd':
      return { ...e, investimentos: alterado(e.investimentos, a.inv) };
    case 'inv.del':
      return { ...e, investimentos: sem(e.investimentos, a.id) };

    case 'meta.add':
      return { ...e, metas: [...e.metas, novo(a.meta)] };
    case 'meta.upd':
      return { ...e, metas: alterado(e.metas, a.meta) };
    case 'meta.del':
      return { ...e, metas: sem(e.metas, a.id) };

    case 'orc.set': {
      const orc: Orcamento = { ...a.orc, id: a.orc.categoria };
      return e.orcamentos.some((o) => o.id === orc.id)
        ? { ...e, orcamentos: alterado(e.orcamentos, { ...orc, demo: false }) }
        : { ...e, orcamentos: [...e.orcamentos, novo(orc)] };
    }
    case 'orc.del':
      return { ...e, orcamentos: sem(e.orcamentos, a.categoria) };

    case 'rec.add':
      return { ...e, recorrentes: [...e.recorrentes, novo(a.rec)] };
    case 'rec.upd':
      return { ...e, recorrentes: alterado(e.recorrentes, a.rec) };
    case 'rec.del':
      return { ...e, recorrentes: sem(e.recorrentes, a.id) };

    case 'categoria.add': {
      const nome = a.nome.trim();
      if (!nome || e.categorias.some((c) => c.nome.toLowerCase() === nome.toLowerCase() && c.tipo === a.tipo)) return e;
      const cat: Categoria = { id: uid(), nome, tipo: a.tipo };
      return { ...e, categorias: [...e.categorias, novo(cat)] };
    }
    case 'categoria.del':
      return { ...e, categorias: sem(e.categorias, a.id) };

    case 'regra.add': {
      const padrao = a.padrao.trim().toLowerCase();
      if (!padrao) return e;
      const existente = e.regras.find((r) => r.padrao === padrao);
      const regra: RegraCategoria = { id: existente?.id ?? uid(), padrao, categoria: a.categoria, origem: a.origem };
      return { ...e, regras: existente ? alterado(e.regras, regra) : [...e.regras, novo(regra)] };
    }
    case 'regra.del':
      return { ...e, regras: sem(e.regras, a.id) };

    case 'correcao.add':
      return { ...e, correcoes: [...e.correcoes, novo({ ...a.correcao, id: uid(), em: agora() })] };

    case 'chat.add':
      return { ...e, conversas: [...e.conversas, novo(a.msg)] };
    case 'chat.limpar':
      return { ...e, conversas: [], memoria: { ...e.memoria, contexto: undefined, modificadoEm: agora() } };
    case 'memoria':
      return { ...e, memoria: { ...e.memoria, ...a.dados, modificadoEm: agora() } };
    case 'memoria.limpar':
      return { ...e, memoria: { preferencias: [], modificadoEm: agora() }, regras: [], correcoes: [] };
    case 'sync.aplicar':
      return aplicarRemotos(e, a.linhas);

    case 'demo.carregar': {
      const demo = dadosDemo();
      const out = { ...e };
      for (const k of Object.keys(demo) as Array<keyof typeof demo>) {
        const atuais = e[k] as Registro[];
        const ids = new Set(atuais.map((r) => r.id));
        // Orçamentos reais têm prioridade sobre os de demonstração
        const extras = (demo[k] as Registro[]).filter((r) => !ids.has(r.id)).map(novo);
        (out as unknown as Record<string, Registro[]>)[k] = [...atuais, ...extras];
      }
      out.movimentacoes = [...out.movimentacoes].sort(porData);
      return out;
    }
    case 'demo.remover': {
      const out = { ...e };
      for (const c of COLECOES) {
        const lista = e[c] as Registro[];
        if (lista.some((r) => r.demo)) (out as unknown as Record<Colecao, Registro[]>)[c] = lista.filter((r) => !r.demo);
      }
      return out;
    }
    default:
      return e;
  }
}

/** Primeira execução: uma conta padrão (não fictícia) para receber os lançamentos. */
function comContaPadrao(e: EstadoApp): EstadoApp {
  if (e.contas.some((c) => !c.demo)) return e;
  const conta: Conta = novo({ id: 'conta-principal', nome: 'Conta principal', tipo: 'corrente', saldoInicial: 0, cor: '#8B5CF6' });
  return { ...e, contas: [conta, ...e.contas] };
}

export interface Toast { id: string; texto: string; tipo: 'ok' | 'erro' | 'info' }

export type StatusPersistencia = 'carregando' | 'ok' | 'salvando' | 'erro';

interface Ctx {
  estado: EstadoApp;
  dispatch: React.Dispatch<Acao>;
  toasts: Toast[];
  avisar: (texto: string, tipo?: Toast['tipo']) => void;
  contaNome: (id: string) => string;
  persistencia: StatusPersistencia;
  erroPersistencia: string | null;
  temDemo: boolean;
  /** Restaura um backup já validado, substituindo todos os dados locais. */
  restaurar: (estado: EstadoApp) => Promise<void>;
  /** Apaga todos os dados locais (inclusive arquivos) e recomeça vazio. */
  apagarTudo: () => Promise<void>;
  /** Muda quando o estado inteiro é substituído (backup restaurado ou dados apagados). */
  geracao: number;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, undefined, db.estadoVazio);
  const [carregado, setCarregado] = useState(false);
  const [persistencia, setPersistencia] = useState<StatusPersistencia>('carregando');
  const [erroPersistencia, setErroPersistencia] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [geracao, setGeracao] = useState(0);
  const timers = useRef<number[]>([]);
  const persistido = useRef<EstadoApp | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  const avisar = useCallback((texto: string, tipo: Toast['tipo'] = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, texto, tipo }]);
    timers.current.push(window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'erro' ? 6000 : 3600));
  }, []);

  // Carrega os registros persistidos ANTES de qualquer cálculo de indicador.
  useEffect(() => {
    let vivo = true;
    db.carregarTudo()
      .then((salvo) => {
        if (!vivo) return;
        persistido.current = salvo;
        dispatch({ t: 'carregar', estado: comContaPadrao(salvo) });
        setPersistencia('ok');
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        const msg = err instanceof Error ? err.message : String(err);
        setErroPersistencia(`Não foi possível abrir o armazenamento local: ${msg}`);
        setPersistencia('erro');
        const vazio = comContaPadrao(db.estadoVazio());
        persistido.current = null;
        dispatch({ t: 'carregar', estado: vazio });
      })
      .finally(() => vivo && setCarregado(true));
    return () => { vivo = false; };
  }, []);

  // Grava as diferenças a cada mudança de estado, em fila (uma transação por vez).
  useEffect(() => {
    if (!carregado || !persistido.current || estado === persistido.current) return;
    const antes = persistido.current;
    persistido.current = estado;
    setPersistencia('salvando');
    fila.current = fila.current
      .then(() => db.sincronizar(antes, estado))
      .then(() => { setPersistencia('ok'); setErroPersistencia(null); })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setPersistencia('erro');
        setErroPersistencia(msg);
        avisar(`Falha ao salvar no navegador: ${msg}`, 'erro');
      });
  }, [estado, carregado, avisar]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Evita fechar/recarregar a página no meio de uma gravação
  useEffect(() => {
    if (persistencia !== 'salvando') return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', segurar);
    return () => window.removeEventListener('beforeunload', segurar);
  }, [persistencia]);

  const restaurar = useCallback(async (novoEstado: EstadoApp) => {
    await fila.current;
    await db.substituirTudo(novoEstado);
    const final = comContaPadrao(novoEstado);
    persistido.current = novoEstado;
    setGeracao((g) => g + 1);
    dispatch({ t: 'carregar', estado: final });
  }, []);

  const apagarTudo = useCallback(async () => {
    await fila.current;
    await db.apagarTudo();
    const vazio = db.estadoVazio();
    persistido.current = vazio;
    setGeracao((g) => g + 1);
    dispatch({ t: 'carregar', estado: comContaPadrao(vazio) });
  }, []);

  const temDemo = useMemo(
    () => COLECOES.some((c) => (estado[c] as Registro[]).some((r) => r.demo)),
    [estado],
  );

  const valor = useMemo<Ctx>(
    () => ({
      estado,
      dispatch,
      toasts,
      avisar,
      contaNome: (id: string) => estado.contas.find((c) => c.id === id)?.nome ?? '—',
      persistencia,
      erroPersistencia,
      temDemo,
      restaurar,
      apagarTudo,
      geracao,
    }),
    [estado, toasts, avisar, persistencia, erroPersistencia, temDemo, restaurar, apagarTudo, geracao],
  );

  if (!carregado) return <TelaCarregamento />;
  return <AppCtx.Provider value={valor}>{children}</AppCtx.Provider>;
}

function TelaCarregamento() {
  return (
    <div className="relative z-10 grid min-h-screen place-items-center" role="status" aria-label="Carregando seus dados">
      <div className="flex flex-col items-center gap-4 animate-fadeIn">
        <svg width="56" height="56" viewBox="0 0 48 48" aria-hidden className="animate-spin [animation-duration:1.6s]">
          <defs>
            <linearGradient id="ld" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#A855F7" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
          </defs>
          <path d="M36.5 12.5A17 17 0 1 0 36.5 35.5" stroke="url(#ld)" strokeWidth="5" strokeLinecap="round" fill="none" />
        </svg>
        <p className="text-[13px] text-txt2">Carregando seus dados locais…</p>
      </div>
    </div>
  );
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}
