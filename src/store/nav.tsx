import React, { createContext, useContext, useMemo, useState } from 'react';
import { mesDe } from '@/lib/format';

export type Rota =
  | 'inicio' | 'movimentacoes' | 'faturas' | 'planejamento'
  | 'investimentos' | 'assistente' | 'configuracoes';

export type ModalGlobal =
  | 'receita' | 'despesa' | 'meta' | 'investimento' | 'simulador' | null;

interface NavCtx {
  rota: Rota;
  ir: (r: Rota) => void;
  periodo: string;                       // yyyy-mm
  setPeriodo: (ym: string) => void;
  modal: ModalGlobal;
  abrir: (m: ModalGlobal) => void;
  fechar: () => void;
  menuMobile: boolean;
  setMenuMobile: (v: boolean) => void;
}

const Ctx = createContext<NavCtx | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [rota, setRota] = useState<Rota>('inicio');
  const [periodo, setPeriodo] = useState(mesDe(new Date().toISOString()));
  const [modal, setModal] = useState<ModalGlobal>(null);
  const [menuMobile, setMenuMobile] = useState(false);

  const valor = useMemo<NavCtx>(
    () => ({
      rota,
      ir: (r) => {
        setRota(r);
        setMenuMobile(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      periodo,
      setPeriodo,
      modal,
      abrir: setModal,
      fechar: () => setModal(null),
      menuMobile,
      setMenuMobile,
    }),
    [rota, periodo, modal, menuMobile],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useNav() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useNav precisa estar dentro de <NavProvider>');
  return c;
}
