import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { mesAtual } from '@/lib/format';

export type Rota =
  | 'inicio' | 'movimentacoes' | 'faturas' | 'planejamento'
  | 'investimentos' | 'assistente' | 'configuracoes';

export type ModalGlobal =
  | 'receita' | 'despesa' | 'meta' | 'investimento' | 'simulador' | null;

const ROTAS: Rota[] = ['inicio', 'movimentacoes', 'faturas', 'planejamento', 'investimentos', 'assistente', 'configuracoes'];

interface NavCtx {
  rota: Rota;
  ir: (r: Rota, opcoes?: { acao?: string }) => void;
  /** Ação pendente para a próxima tela (ex.: abrir o seletor de arquivos em Faturas). */
  acaoPendente: string | null;
  consumirAcao: () => string | null;
  periodo: string;                       // yyyy-mm
  setPeriodo: (ym: string) => void;
  modal: ModalGlobal;
  abrir: (m: ModalGlobal) => void;
  fechar: () => void;
}

const Ctx = createContext<NavCtx | null>(null);

const rotaDoHash = (): Rota => {
  const h = window.location.hash.replace('#/', '').replace('#', '') as Rota;
  return ROTAS.includes(h) ? h : 'inicio';
};

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [rota, setRota] = useState<Rota>(rotaDoHash);
  const [periodo, setPeriodo] = useState(mesAtual());
  const [modal, setModal] = useState<ModalGlobal>(null);
  const [acaoPendente, setAcaoPendente] = useState<string | null>(null);

  // Navegação sem recarregar a página, com suporte ao botão "voltar" do navegador.
  useEffect(() => {
    const onHash = () => setRota(rotaDoHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const valor = useMemo<NavCtx>(
    () => ({
      rota,
      ir: (r, opcoes) => {
        setAcaoPendente(opcoes?.acao ?? null);
        setRota(r);
        const alvo = r === 'inicio' ? '#/' : `#/${r}`;
        if (window.location.hash !== alvo) window.history.pushState(null, '', alvo);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      acaoPendente,
      consumirAcao: () => {
        const a = acaoPendente;
        if (a) setAcaoPendente(null);
        return a;
      },
      periodo,
      setPeriodo,
      modal,
      abrir: setModal,
      fechar: () => setModal(null),
    }),
    [rota, periodo, modal, acaoPendente],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useNav() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useNav precisa estar dentro de <NavProvider>');
  return c;
}
