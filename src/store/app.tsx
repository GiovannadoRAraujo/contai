import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  Conta, EstadoApp, Fatura, Investimento, Mensagem, Meta, Movimentacao, Orcamento, Recorrente, Usuario,
} from '@/types';
import { estadoDemo } from '@/data/demo';
import { uid } from '@/lib/format';

const CHAVE = 'contai.estado.v1';

type Acao =
  | { t: 'carregar'; estado: EstadoApp }
  | { t: 'autenticar'; usuario: Partial<Usuario> }
  | { t: 'sair' }
  | { t: 'usuario'; dados: Partial<Usuario> }
  | { t: 'mov.add'; movs: Movimentacao[] }
  | { t: 'mov.upd'; mov: Movimentacao }
  | { t: 'mov.del'; id: string }
  | { t: 'conta.add'; conta: Conta }
  | { t: 'fatura.add'; fatura: Fatura }
  | { t: 'fatura.upd'; fatura: Fatura }
  | { t: 'fatura.del'; id: string }
  | { t: 'inv.add'; inv: Investimento }
  | { t: 'inv.upd'; inv: Investimento }
  | { t: 'inv.del'; id: string }
  | { t: 'meta.add'; meta: Meta }
  | { t: 'meta.upd'; meta: Meta }
  | { t: 'meta.del'; id: string }
  | { t: 'orc.set'; orc: Orcamento }
  | { t: 'orc.del'; categoria: string }
  | { t: 'rec.add'; rec: Recorrente }
  | { t: 'rec.upd'; rec: Recorrente }
  | { t: 'rec.del'; id: string }
  | { t: 'categoria.add'; nome: string }
  | { t: 'regra.add'; padrao: string; categoria: string }
  | { t: 'chat.add'; msg: Mensagem }
  | { t: 'chat.limpar' }
  | { t: 'reset' };

function reducer(e: EstadoApp, a: Acao): EstadoApp {
  switch (a.t) {
    case 'carregar':
      return a.estado;
    case 'autenticar':
      return { ...e, autenticado: true, usuario: { ...e.usuario, ...a.usuario } };
    case 'sair':
      return { ...e, autenticado: false };
    case 'usuario':
      return { ...e, usuario: { ...e.usuario, ...a.dados } };

    case 'mov.add':
      return { ...e, movimentacoes: [...a.movs, ...e.movimentacoes].sort((x, y) => y.data.localeCompare(x.data)) };
    case 'mov.upd':
      return {
        ...e,
        movimentacoes: e.movimentacoes.map((m) => (m.id === a.mov.id ? a.mov : m)).sort((x, y) => y.data.localeCompare(x.data)),
      };
    case 'mov.del':
      return { ...e, movimentacoes: e.movimentacoes.filter((m) => m.id !== a.id) };

    case 'conta.add':
      return { ...e, contas: [...e.contas, a.conta] };

    case 'fatura.add':
      return { ...e, faturas: [a.fatura, ...e.faturas] };
    case 'fatura.upd':
      return { ...e, faturas: e.faturas.map((f) => (f.id === a.fatura.id ? a.fatura : f)) };
    case 'fatura.del':
      return { ...e, faturas: e.faturas.filter((f) => f.id !== a.id) };

    case 'inv.add':
      return { ...e, investimentos: [a.inv, ...e.investimentos] };
    case 'inv.upd':
      return { ...e, investimentos: e.investimentos.map((i) => (i.id === a.inv.id ? a.inv : i)) };
    case 'inv.del':
      return { ...e, investimentos: e.investimentos.filter((i) => i.id !== a.id) };

    case 'meta.add':
      return { ...e, metas: [...e.metas, a.meta] };
    case 'meta.upd':
      return { ...e, metas: e.metas.map((m) => (m.id === a.meta.id ? a.meta : m)) };
    case 'meta.del':
      return { ...e, metas: e.metas.filter((m) => m.id !== a.id) };

    case 'orc.set': {
      const existe = e.orcamentos.some((o) => o.categoria === a.orc.categoria);
      return {
        ...e,
        orcamentos: existe
          ? e.orcamentos.map((o) => (o.categoria === a.orc.categoria ? a.orc : o))
          : [...e.orcamentos, a.orc],
      };
    }
    case 'orc.del':
      return { ...e, orcamentos: e.orcamentos.filter((o) => o.categoria !== a.categoria) };

    case 'rec.add':
      return { ...e, recorrentes: [...e.recorrentes, a.rec] };
    case 'rec.upd':
      return { ...e, recorrentes: e.recorrentes.map((r) => (r.id === a.rec.id ? a.rec : r)) };
    case 'rec.del':
      return { ...e, recorrentes: e.recorrentes.filter((r) => r.id !== a.id) };

    case 'categoria.add':
      return e.categoriasCustom.includes(a.nome)
        ? e
        : { ...e, categoriasCustom: [...e.categoriasCustom, a.nome] };

    case 'regra.add':
      return { ...e, regrasCategoria: { ...e.regrasCategoria, [a.padrao.toLowerCase()]: a.categoria } };

    case 'chat.add':
      return { ...e, conversas: [...e.conversas, a.msg] };
    case 'chat.limpar':
      return { ...e, conversas: [] };

    case 'reset':
      return { ...estadoDemo(e.usuario.nome), autenticado: true, usuario: e.usuario };
    default:
      return e;
  }
}

function carregar(): EstadoApp {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const salvo = JSON.parse(bruto) as EstadoApp;
      // mescla com o shape atual para tolerar versões anteriores
      return { ...estadoDemo(), ...salvo, usuario: { ...estadoDemo().usuario, ...salvo.usuario } };
    }
  } catch {
    /* estado corrompido: recomeça com a base de demonstração */
  }
  return estadoDemo();
}

export interface Toast { id: string; texto: string; tipo: 'ok' | 'erro' | 'info' }

interface Ctx {
  estado: EstadoApp;
  dispatch: React.Dispatch<Acao>;
  toasts: Toast[];
  avisar: (texto: string, tipo?: Toast['tipo']) => void;
  contaNome: (id: string) => string;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, undefined as unknown as EstadoApp, carregar);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* quota excedida: o app segue funcionando apenas em memória */
    }
  }, [estado]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const avisar = (texto: string, tipo: Toast['tipo'] = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, texto, tipo }]);
    timers.current.push(window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600));
  };

  const valor = useMemo<Ctx>(
    () => ({
      estado,
      dispatch,
      toasts,
      avisar,
      contaNome: (id: string) => estado.contas.find((c) => c.id === id)?.nome ?? '—',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estado, toasts],
  );

  return <AppCtx.Provider value={valor}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}
