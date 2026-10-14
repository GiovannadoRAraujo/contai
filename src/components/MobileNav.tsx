import { useState } from 'react';
import clsx from 'clsx';
import { ArrowLeftRight, Bot, FileText, Home, LineChart, MoreHorizontal, Settings, Target } from 'lucide-react';
import { useNav, type Rota } from '@/store/nav';
import { Modal } from './ui';

const PRINCIPAIS: Array<{ rota: Rota; nome: string; Icone: typeof Home }> = [
  { rota: 'inicio', nome: 'Início', Icone: Home },
  { rota: 'movimentacoes', nome: 'Movimentações', Icone: ArrowLeftRight },
  { rota: 'faturas', nome: 'Faturas', Icone: FileText },
  { rota: 'planejamento', nome: 'Planejamento', Icone: Target },
];

const EXTRAS: Array<{ rota: Rota; nome: string; descricao: string; Icone: typeof Home }> = [
  { rota: 'investimentos', nome: 'Investimentos', descricao: 'Carteira, rentabilidade e simulador', Icone: LineChart },
  { rota: 'assistente', nome: 'Assistente IA', descricao: 'Pergunte sobre os seus dados', Icone: Bot },
  { rota: 'configuracoes', nome: 'Configurações', descricao: 'Conta, privacidade e preferências', Icone: Settings },
];

export default function MobileNav() {
  const { rota, ir } = useNav();
  const [mais, setMais] = useState(false);
  const emMais = EXTRAS.some((e) => e.rota === rota);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-nav/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Navegação inferior"
      >
        <div className="grid grid-cols-5">
          {PRINCIPAIS.map(({ rota: r, nome, Icone }) => {
            const ativo = rota === r;
            return (
              <button key={r} type="button" onClick={() => ir(r)} aria-current={ativo ? 'page' : undefined}
                className="flex flex-col items-center gap-1 py-2.5">
                <Icone size={19} className={clsx('transition-colors', ativo ? 'text-roxo-luz' : 'text-txt3')} />
                <span className={clsx('text-[10px] font-medium', ativo ? 'text-txt' : 'text-txt3')}>{nome}</span>
                {ativo && <span className="h-[3px] w-6 rounded-full bg-roxo-luz" />}
              </button>
            );
          })}
          <button type="button" onClick={() => setMais(true)} className="flex flex-col items-center gap-1 py-2.5">
            <MoreHorizontal size={19} className={clsx(emMais ? 'text-roxo-luz' : 'text-txt3')} />
            <span className={clsx('text-[10px] font-medium', emMais ? 'text-txt' : 'text-txt3')}>Mais</span>
            {emMais && <span className="h-[3px] w-6 rounded-full bg-roxo-luz" />}
          </button>
        </div>
      </nav>

      <Modal aberto={mais} onFechar={() => setMais(false)} titulo="Mais" descricao="Outras áreas do contAI">
        <div className="space-y-2">
          {EXTRAS.map(({ rota: r, nome, descricao, Icone }) => (
            <button key={r} type="button" onClick={() => { ir(r); setMais(false); }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-card2 p-3.5 text-left transition-colors hover:border-roxo/50">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-roxo/15 text-roxo-luz">
                <Icone size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-txt">{nome}</span>
                <span className="block text-[12px] text-txt2">{descricao}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
