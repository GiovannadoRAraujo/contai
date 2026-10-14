import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Settings, User } from 'lucide-react';
import clsx from 'clsx';
import Logo from './Logo';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { addMeses, iniciais, rotuloMes } from '@/lib/format';
import { alertas } from '@/lib/finance';

const TITULOS: Record<string, { titulo: string; sub: string }> = {
  inicio: { titulo: 'Olá, {nome}!', sub: 'Aqui está um resumo da sua vida financeira.' },
  movimentacoes: { titulo: 'Movimentações', sub: 'Consulte e administre todas as suas transações.' },
  faturas: { titulo: 'Faturas', sub: 'Organize, envie e importe suas faturas com o apoio da IA.' },
  planejamento: { titulo: 'Planejamento', sub: 'Orçamento, metas e contas recorrentes.' },
  investimentos: { titulo: 'Investimentos', sub: 'Acompanhe sua carteira e simule rendimentos.' },
  assistente: { titulo: 'Assistente contAI', sub: 'Pergunte sobre os seus próprios dados financeiros.' },
  configuracoes: { titulo: 'Configurações', sub: 'Conta, privacidade e preferências.' },
};

export default function Topbar() {
  const { estado, dispatch, avisar } = useApp();
  const { rota, periodo, setPeriodo, setMenuMobile, ir } = useNav();
  const [menu, setMenu] = useState(false);
  const [sinos, setSinos] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const avisos = alertas(estado);
  const info = TITULOS[rota] ?? TITULOS.inicio;
  const titulo = info.titulo.replace('{nome}', estado.usuario.nome.split(' ')[0]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenu(false);
        setSinos(false);
      }
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const meses = Array.from({ length: 12 }, (_, i) => addMeses(new Date().toISOString().slice(0, 7), -i));

  return (
    <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-line/50 bg-bg/85 px-4 pb-4 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-1 lg:backdrop-blur-none">
      {/* Linha do topo no mobile */}
      <div className="mb-3 flex items-center justify-between lg:hidden">
        <button type="button" onClick={() => setMenuMobile(true)} aria-label="Abrir menu" className="rounded-lg p-1.5 text-txt2 hover:bg-card2 hover:text-txt">
          <Menu size={20} />
        </button>
        <Logo tamanho={28} />
        <button type="button" onClick={() => setSinos((v) => !v)} aria-label="Notificações" className="relative rounded-lg p-1.5 text-txt2 hover:bg-card2 hover:text-txt">
          <Bell size={19} />
          {avisos.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rosa" />}
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4" ref={ref}>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-tight text-txt sm:text-[26px]">
            {titulo}
            {rota === 'inicio' && <span className="text-[20px]" aria-hidden>👋</span>}
          </h1>
          <p className="mt-0.5 text-[13px] text-txt2">{info.sub}</p>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <label className="sr-only" htmlFor="periodo">Período</label>
          <select
            id="periodo"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="field w-[190px] cursor-pointer appearance-none bg-card py-2.5 text-[13px] font-medium"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239AA8C7' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
            }}
          >
            {meses.map((m) => (
              <option key={m} value={m}>{rotuloMes(m)}</option>
            ))}
          </select>

          <div className="relative">
            <button type="button" onClick={() => { setSinos((v) => !v); setMenu(false); }} aria-label="Notificações"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-card text-txt2 transition-colors hover:border-roxo/50 hover:text-txt">
              <Bell size={18} />
              {avisos.length > 0 && (
                <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rosa px-1 text-[10px] font-bold text-white">
                  {avisos.length}
                </span>
              )}
            </button>
            {sinos && <PainelAvisos avisos={avisos} />}
          </div>

          <div className="relative">
            <button type="button" onClick={() => { setMenu((v) => !v); setSinos(false); }}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-card py-1.5 pl-1.5 pr-3 transition-colors hover:border-roxo/50">
              <span className="grid h-8 w-8 place-items-center rounded-lg text-[12px] font-bold text-white"
                style={{ backgroundImage: 'linear-gradient(135deg,#7C3AED,#A855F7)' }}>
                {iniciais(estado.usuario.nome)}
              </span>
              <span className="text-[13px] font-medium text-txt">{estado.usuario.nome}</span>
              <ChevronDown size={15} className={clsx('text-txt3 transition-transform', menu && 'rotate-180')} />
            </button>
            {menu && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 animate-pop rounded-xl border border-line bg-card p-1.5 shadow-glow">
                <div className="border-b border-line/70 px-3 py-2">
                  <p className="text-[13px] font-semibold text-txt">{estado.usuario.nome}</p>
                  <p className="truncate text-[11.5px] text-txt3">{estado.usuario.email}</p>
                </div>
                <ItemMenu Icone={User} rotulo="Minha conta" onClick={() => { ir('configuracoes'); setMenu(false); }} />
                <ItemMenu Icone={Settings} rotulo="Configurações" onClick={() => { ir('configuracoes'); setMenu(false); }} />
                <ItemMenu
                  Icone={LogOut}
                  rotulo="Sair"
                  onClick={() => { dispatch({ t: 'sair' }); avisar('Sessão encerrada.', 'info'); }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Painel de notificações no mobile */}
      {sinos && (
        <div className="mt-3 lg:hidden">
          <PainelAvisos avisos={avisos} embutido />
        </div>
      )}

      {/* Seletor de período no mobile */}
      <div className="mt-3 lg:hidden">
        <select
          aria-label="Período"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="field cursor-pointer appearance-none bg-card py-2 text-[13px] font-medium"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239AA8C7' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
          }}
        >
          {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
      </div>
    </header>
  );
}

function ItemMenu({ Icone, rotulo, onClick }: { Icone: typeof User; rotulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-txt2 transition-colors hover:bg-card2 hover:text-txt">
      <Icone size={15} />
      {rotulo}
    </button>
  );
}

function PainelAvisos({ avisos, embutido = false }: { avisos: ReturnType<typeof alertas>; embutido?: boolean }) {
  return (
    <div className={clsx(
      'z-30 animate-pop rounded-xl border border-line bg-card p-2 shadow-glow',
      embutido ? 'w-full' : 'absolute right-0 top-[calc(100%+8px)] w-80',
    )}>
      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-txt3">Notificações</p>
      {avisos.length === 0 && <p className="px-2 pb-2 text-[13px] text-txt2">Nenhum alerta no momento.</p>}
      {avisos.map((a) => (
        <div key={a.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-card2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.cor }} />
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium leading-snug text-txt">{a.titulo}</p>
            <p className="text-[11.5px] text-txt3">{a.detalhe}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
