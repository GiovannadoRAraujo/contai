import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@/store/app';
import { brl } from '@/lib/format';

/* ------------------------------ Card ------------------------------ */
export function Card({
  children, className = '', hover = false, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={clsx('card', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  );
}

export function CabecalhoCard({
  titulo, acao, onAcao, icone,
}: { titulo: string; acao?: string; onAcao?: () => void; icone?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-txt">
        {icone}
        {titulo}
      </h3>
      {acao && (
        <button
          type="button"
          onClick={onAcao}
          className="group inline-flex items-center gap-1 text-xs font-medium text-roxo-luz transition-colors hover:text-txt"
        >
          {acao}
          <span className="transition-transform group-hover:translate-x-0.5">›</span>
        </button>
      )}
    </div>
  );
}

/* ----------------------------- Valores ---------------------------- */
/** Exibe um valor em BRL respeitando a preferência de ocultar valores. */
export function Valor({ v, className = '' }: { v: number; className?: string }) {
  const { estado } = useApp();
  if (estado.prefs.ocultarValores) {
    return <span className={clsx('select-none tracking-widest', className)}>R$ ••••••</span>;
  }
  return <span className={className}>{brl(v)}</span>;
}

export function Variacao({
  v, invertido = false, sufixo = 'em relação ao mês anterior', tomClaro = false,
}: { v: number | null; invertido?: boolean; sufixo?: string; tomClaro?: boolean }) {
  if (v === null || !Number.isFinite(v)) {
    return (
      <span className={clsx('text-[10.5px] sm:text-xs', tomClaro ? 'text-white/70 xl:text-txt3' : 'text-txt3')}>
        Sem base de comparação
      </span>
    );
  }
  const positivo = v >= 0;
  const bom = invertido ? !positivo : positivo;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[10.5px] leading-snug sm:text-[11.5px]">
      <span className={clsx('inline-flex items-center gap-0.5 font-semibold', bom ? 'text-verde' : 'text-rosa')}>
        <svg width="10" height="10" viewBox="0 0 10 10" className={positivo ? '' : 'rotate-180'} aria-hidden>
          <path d="M5 1l4 7H1z" fill="currentColor" />
        </svg>
        {Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
      </span>
      <span className={clsx(tomClaro ? 'text-white/70 xl:text-txt3' : 'text-txt3')}>{sufixo}</span>
    </span>
  );
}

/* ------------------------------ Badge ----------------------------- */
const TONS: Record<string, string> = {
  roxo: 'bg-roxo/15 text-roxo-luz border-roxo/30',
  verde: 'bg-verde/12 text-verde border-verde/30',
  rosa: 'bg-rosa/12 text-rosa border-rosa/30',
  laranja: 'bg-laranja/12 text-laranja border-laranja/30',
  ciano: 'bg-ciano/12 text-ciano border-ciano/30',
  neutro: 'bg-card2 text-txt2 border-line',
};

export function Badge({ children, tom = 'neutro', className = '' }: { children: React.ReactNode; tom?: keyof typeof TONS; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold', TONS[tom], className)}>
      {children}
    </span>
  );
}

/* ----------------------------- Progresso -------------------------- */
export function Barra({ pct, cor = '#8B5CF6', altura = 6 }: { pct: number; cor?: string; altura?: number }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full overflow-hidden rounded-full bg-card2" style={{ height: altura }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${v}%`, backgroundImage: `linear-gradient(90deg, ${cor}, ${cor}dd)`, boxShadow: `0 0 12px -2px ${cor}` }}
      />
    </div>
  );
}

/* ------------------------------ Modal ----------------------------- */
export function Modal({
  aberto, onFechar, titulo, descricao, children, largura = 'max-w-lg',
}: {
  aberto: boolean; onFechar: () => void; titulo: string; descricao?: string;
  children: React.ReactNode; largura?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', onKey);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = antes;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#02040c]/80 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-fadeIn">
      <div className="absolute inset-0" onClick={onFechar} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={clsx(
          'relative z-10 w-full animate-pop rounded-t-3xl border border-line bg-card shadow-glow outline-none sm:rounded-2xl',
          largura,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-txt">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-[13px] text-txt2">{descricao}</p>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-txt3 transition-colors hover:bg-card2 hover:text-txt">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------- Formulário -------------------------- */
export function Campo({
  rotulo, erro, children, dica, className = '',
}: { rotulo: string; erro?: string; children: React.ReactNode; dica?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-txt2">{rotulo}</span>
      {children}
      {dica && !erro && <span className="mt-1 block text-[11px] text-txt3">{dica}</span>}
      {erro && <span className="mt-1 block text-[11px] font-medium text-rosa">{erro}</span>}
    </label>
  );
}

export const Entrada = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Entrada(props, ref) {
    return <input ref={ref} {...props} className={clsx('field', props.className)} />;
  },
);

export function Selecao(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx('field appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', props.className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239AA8C7' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    />
  );
}

/* ------------------------------ Vazio ----------------------------- */
export function Vazio({
  icone, titulo, descricao, acao,
}: { icone: React.ReactNode; titulo: string; descricao: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-card2 text-roxo-luz">{icone}</div>
      <h4 className="text-[15px] font-semibold text-txt">{titulo}</h4>
      <p className="max-w-sm text-[13px] leading-relaxed text-txt2">{descricao}</p>
      {acao}
    </div>
  );
}

/* --------------------------- Carregando --------------------------- */
export function Carregando({ linhas = 3, altura = 54 }: { linhas?: number; altura?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: altura }} />
      ))}
    </div>
  );
}

/* ----------------------------- Toasts ----------------------------- */
const ICONES = { ok: Check, erro: AlertTriangle, info: Info };
const CORES = { ok: 'border-verde/40 text-verde', erro: 'border-rosa/40 text-rosa', info: 'border-roxo/40 text-roxo-luz' };

export function Avisos() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0" aria-live="polite">
      {toasts.map((t) => {
        const Icone = ICONES[t.tipo];
        return (
          <div key={t.id} className={clsx('pointer-events-auto flex animate-fadeUp items-start gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-card', CORES[t.tipo])}>
            <Icone size={16} className="mt-0.5 shrink-0" />
            <span className="text-[13px] leading-snug text-txt">{t.texto}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------- Confirmação ------------------------- */
export function Confirmacao({
  aberto, titulo, mensagem, onConfirmar, onCancelar, rotuloConfirmar = 'Excluir', perigoso = true,
}: {
  aberto: boolean; titulo: string; mensagem: string; onConfirmar: () => void; onCancelar: () => void;
  rotuloConfirmar?: string; perigoso?: boolean;
}) {
  return (
    <Modal aberto={aberto} onFechar={onCancelar} titulo={titulo} largura="max-w-md">
      <p className="text-[13px] leading-relaxed text-txt2">{mensagem}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button
          type="button"
          onClick={onConfirmar}
          className={clsx('btn text-white', perigoso ? 'bg-rosa/90 hover:bg-rosa' : 'btn-primary')}
        >
          {rotuloConfirmar}
        </button>
      </div>
    </Modal>
  );
}
