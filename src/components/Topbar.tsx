import { useEffect, useRef, useState } from 'react';
import { Bell, Settings } from 'lucide-react';
import clsx from 'clsx';
import Logo from './Logo';
import { IndicadorSync } from './Conta';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { addMeses, mesAtual, rotuloMes } from '@/lib/format';
import { alertas } from '@/lib/finance';

const TITULOS: Record<string, { titulo: string; sub: string; subMobile?: string }> = {
  inicio: { titulo: 'Olá!', sub: 'Aqui está um resumo da sua vida financeira.', subMobile: 'Aqui está seu resumo financeiro.' },
  movimentacoes: { titulo: 'Movimentações', sub: 'Consulte e administre todas as suas transações.' },
  faturas: { titulo: 'Faturas e documentos', sub: 'Envie, leia e importe suas faturas com revisão antes de importar.' },
  planejamento: { titulo: 'Planejamento', sub: 'Orçamento, metas e contas recorrentes.' },
  investimentos: { titulo: 'Investimentos', sub: 'Acompanhe sua carteira e simule rendimentos.' },
  assistente: { titulo: 'Assistente contAI', sub: 'Pergunte sobre os seus próprios dados financeiros.' },
  configuracoes: { titulo: 'Configurações', sub: 'Privacidade, dados locais, backup e preferências.' },
};

const SETA =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239AA8C7' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

export default function Topbar() {
  const { estado } = useApp();
  const { rota, periodo, setPeriodo, ir } = useNav();
  const [sinos, setSinos] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const avisos = alertas(estado);
  const info = TITULOS[rota] ?? TITULOS.inicio;

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setSinos(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  useEffect(() => setSinos(false), [rota]);

  const meses = Array.from({ length: 24 }, (_, i) => addMeses(mesAtual(), -i));

  const seletor = (classe: string) => (
    <select
      aria-label="Período"
      value={periodo}
      onChange={(e) => setPeriodo(e.target.value)}
      className={clsx('field cursor-pointer appearance-none bg-card text-[13px] font-medium', classe)}
      style={{ backgroundImage: SETA, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
    >
      {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
    </select>
  );

  const botaoSino = (classe: string) => (
    <button
      type="button"
      onClick={() => setSinos((v) => !v)}
      aria-label={`Notificações (${avisos.length})`}
      aria-expanded={sinos}
      className={clsx('relative grid place-items-center text-txt2 transition-colors hover:text-txt', classe)}
    >
      <Bell size={18} />
      {avisos.length > 0 && (
        <span className="absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rosa px-1 text-[10px] font-bold text-white">
          {avisos.length}
        </span>
      )}
    </button>
  );

  return (
    <header ref={ref} className="sticky top-0 z-20 -mx-4 mb-5 border-b border-line/50 bg-bg/90 px-4 pb-4 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-1 lg:backdrop-blur-none">
      {/* Topo mobile: logo à esquerda, notificações e configurações à direita */}
      <div className="mb-3 flex items-center justify-between lg:hidden">
        <button type="button" onClick={() => ir('inicio')} aria-label="Início">
          <Logo tamanho={28} />
        </button>
        <div className="flex items-center gap-1">
          <IndicadorSync compacto />
          {botaoSino('h-9 w-9 rounded-lg hover:bg-card2')}
          <button type="button" onClick={() => ir('configuracoes')} aria-label="Configurações"
            className="grid h-9 w-9 place-items-center rounded-lg text-txt2 hover:bg-card2 hover:text-txt">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-tight text-txt sm:text-[26px]">
            {info.titulo}
            {rota === 'inicio' && <span className="text-[20px]" aria-hidden>👋</span>}
          </h1>
          <p className="mt-0.5 text-[13px] text-txt2">
            <span className="sm:hidden">{info.subMobile ?? info.sub}</span>
            <span className="hidden sm:inline">{info.sub}</span>
          </p>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {seletor('w-[190px] py-2.5')}
          <IndicadorSync />
          <div className="relative">
            {botaoSino('h-10 w-10 rounded-xl border border-line bg-card hover:border-roxo/50')}
            {sinos && <PainelAvisos avisos={avisos} onIr={(r) => ir(r)} />}
          </div>
          <button type="button" onClick={() => ir('configuracoes')} aria-label="Configurações"
            className={clsx(
              'grid h-10 w-10 place-items-center rounded-xl border bg-card text-txt2 transition-colors hover:border-roxo/50 hover:text-txt',
              rota === 'configuracoes' ? 'border-roxo/60 text-txt' : 'border-line',
            )}>
            <Settings size={18} />
          </button>
        </div>
      </div>

      {sinos && (
        <div className="mt-3 lg:hidden">
          <PainelAvisos avisos={avisos} embutido onIr={(r) => ir(r)} />
        </div>
      )}

      {rota !== 'assistente' && rota !== 'configuracoes' && <div className="mt-3 lg:hidden">{seletor('py-2')}</div>}
    </header>
  );
}

function PainelAvisos({
  avisos, embutido = false, onIr,
}: { avisos: ReturnType<typeof alertas>; embutido?: boolean; onIr: (r: 'faturas' | 'planejamento' | 'configuracoes') => void }) {
  return (
    <div className={clsx(
      'z-30 animate-pop rounded-xl border border-line bg-card p-2 shadow-glow',
      embutido ? 'w-full' : 'absolute right-0 top-[calc(100%+8px)] w-80',
    )}>
      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-txt3">Notificações e alertas</p>
      {avisos.length === 0 && <p className="px-2 pb-2 text-[13px] text-txt2">Nenhum alerta no momento.</p>}
      {avisos.map((a) => (
        <button key={a.id} type="button" onClick={() => onIr(a.tipo === 'meta' ? 'planejamento' : a.tipo === 'cartao' ? 'configuracoes' : 'faturas')}
          className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-card2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.cor }} />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium leading-snug text-txt">{a.titulo}</span>
            <span className="block text-[11.5px] text-txt3">{a.detalhe}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
