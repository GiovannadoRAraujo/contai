import clsx from 'clsx';
import {
  ArrowLeftRight, Bot, FileText, Home, LineChart, Settings, Sparkles, Target, X,
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
];

function Conteudo({ onFechar }: { onFechar?: () => void }) {
  const { rota, ir } = useNav();

  return (
    <div className="flex h-full flex-col gap-1 px-3 py-5">
      <div className="mb-6 flex items-center justify-between px-2">
        <Logo tamanho={32} />
        {onFechar && (
          <button type="button" onClick={onFechar} aria-label="Fechar menu" className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-txt lg:hidden">
            <X size={18} />
          </button>
        )}
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
                ativo
                  ? 'text-white shadow-glowsm'
                  : 'text-txt2 hover:bg-card2 hover:text-txt',
              )}
              style={ativo ? { backgroundImage: 'linear-gradient(135deg, rgba(124,58,237,.95), rgba(139,92,246,.55))' } : undefined}
            >
              <Icone size={18} className={clsx('shrink-0 transition-transform group-hover:scale-110', ativo ? 'text-white' : 'text-txt3 group-hover:text-roxo-luz')} />
              {nome}
              {ativo && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-verde" aria-hidden />}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <PromoIA />
        <button
          type="button"
          onClick={() => ir('configuracoes')}
          className={clsx(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors',
            rota === 'configuracoes' ? 'bg-card2 text-txt' : 'text-txt2 hover:bg-card2 hover:text-txt',
          )}
        >
          <Settings size={18} className="text-txt3" />
          Configurações
        </button>
      </div>
    </div>
  );
}

function PromoIA() {
  const { ir } = useNav();
  return (
    <div
      className="rounded-2xl border border-roxo/30 p-4"
      style={{ backgroundImage: 'linear-gradient(160deg, rgba(124,58,237,.22), rgba(11,18,40,.9))' }}
    >
      <span className="mb-3 inline-grid h-9 w-9 place-items-center rounded-xl bg-roxo/30 text-roxo-luz">
        <Sparkles size={17} />
      </span>
      <p className="text-[13px] font-semibold leading-snug text-txt">
        Deixe sua vida financeira mais inteligente.
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-txt2">
        Envie suas faturas, tire dúvidas e receba insights personalizados com o nosso assistente de IA.
      </p>
      <button type="button" onClick={() => ir('assistente')} className="btn-primary mt-3 w-full py-2 text-[12.5px]">
        Conversar com a IA
      </button>
    </div>
  );
}

export default function Sidebar() {
  const { menuMobile, setMenuMobile } = useNav();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-line/60 bg-nav lg:block">
        <Conteudo />
      </aside>

      {menuMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#02040c]/80 backdrop-blur-sm animate-fadeIn" onClick={() => setMenuMobile(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[268px] animate-fadeIn border-r border-line/60 bg-nav">
            <Conteudo onFechar={() => setMenuMobile(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
