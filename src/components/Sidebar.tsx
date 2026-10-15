import clsx from 'clsx';
import {
  ArrowLeftRight, Bot, FileText, Home, LineChart, Settings, Sparkles, Target,
} from 'lucide-react';
import Logo from './Logo';
import { useNav, type Rota } from '@/store/nav';

export const ITENS: Array<{ rota: Rota; nome: string; Icone: typeof Home }> = [
  { rota: 'inicio', nome: 'Início', Icone: Home },
  { rota: 'movimentacoes', nome: 'Movimentações', Icone: ArrowLeftRight },
  { rota: 'faturas', nome: 'Faturas', Icone: FileText },
  { rota: 'planejamento', nome: 'Planejamento', Icone: Target },
  { rota: 'investimentos', nome: 'Investimentos', Icone: LineChart },
  { rota: 'assistente', nome: 'Assistente IA', Icone: Bot },
  { rota: 'configuracoes', nome: 'Configurações', Icone: Settings },
];

function PromoIA() {
  const { ir } = useNav();
  return (
    <div
      className="rounded-2xl border border-roxo/35 p-4"
      style={{ backgroundImage: 'linear-gradient(165deg, rgba(124,58,237,.30) 0%, rgba(16,24,49,.95) 70%)' }}
    >
      <span className="mb-3 inline-grid h-10 w-10 place-items-center rounded-xl border border-roxo/40 bg-roxo/25 text-roxo-luz shadow-glowsm">
        <Sparkles size={18} />
      </span>
      <p className="text-[14px] font-bold leading-snug text-txt">
        Deixe sua vida financeira mais inteligente.
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-txt2">
        Converse com a IA e tenha insights calculados a partir dos seus próprios registros.
      </p>
      <button type="button" onClick={() => ir('assistente')} className="btn-primary mt-3.5 w-full py-2 text-[12.5px]">
        Conversar com a IA
      </button>
    </div>
  );
}

export default function Sidebar() {
  const { rota, ir } = useNav();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-line/60 bg-nav lg:block">
      <div className="flex h-full flex-col px-3 py-6">
        <div className="mb-8 px-3">
          <Logo tamanho={32} />
        </div>

        <nav className="flex flex-col gap-1" aria-label="Navegação principal">
          {ITENS.map(({ rota: r, nome, Icone }) => {
            const ativo = rota === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => ir(r)}
                aria-current={ativo ? 'page' : undefined}
                className={clsx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200',
                  ativo ? 'text-white shadow-glowsm' : 'text-txt2 hover:bg-card2 hover:text-txt',
                )}
                style={ativo ? { backgroundImage: 'linear-gradient(135deg, #7C3AED 0%, rgba(139,92,246,.62) 100%)' } : undefined}
              >
                <Icone size={18} className={clsx('shrink-0 transition-transform group-hover:scale-110', ativo ? 'text-white' : 'text-txt3 group-hover:text-roxo-luz')} />
                {nome}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-6">
          <PromoIA />
        </div>
      </div>
    </aside>
  );
}
