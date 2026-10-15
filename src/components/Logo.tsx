import { useId } from 'react';

interface Props {
  tamanho?: number;
  comNome?: boolean;
  className?: string;
}

/**
 * Símbolo do contAI: um "C" circular em gradiente roxo, com um núcleo
 * luminoso que remete à inteligência artificial.
 */
export function Marca({ tamanho = 34, fundo = false }: { tamanho?: number; fundo?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full"
      style={{
        width: tamanho,
        height: tamanho,
        background: fundo ? 'radial-gradient(circle at 50% 50%, rgba(124,58,237,.28), rgba(11,18,40,.9) 70%)' : undefined,
        boxShadow: fundo ? '0 0 0 1px rgba(168,85,247,.35)' : undefined,
      }}
      aria-hidden
    >
      <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`c-${id}`} x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#C084FC" />
            <stop offset=".5" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#5B5CF6" />
          </linearGradient>
          <filter id={`g-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        {/* brilho discreto atrás do traço */}
        <path d="M36.6 13.2A15.5 15.5 0 1 0 36.6 34.8" stroke="#7C3AED" strokeOpacity=".55" strokeWidth="6" strokeLinecap="round" filter={`url(#g-${id})`} />
        <path d="M36.6 13.2A15.5 15.5 0 1 0 36.6 34.8" stroke={`url(#c-${id})`} strokeWidth="5.2" strokeLinecap="round" />
        {/* anel interno fino */}
        <path d="M30.6 18.3A8.4 8.4 0 1 0 30.6 29.7" stroke="#A855F7" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
        {/* núcleo de IA */}
        <circle cx="24" cy="24" r="3.4" fill="#A855F7" filter={`url(#g-${id})`} />
        <circle cx="24" cy="24" r="2.1" fill="#F5F7FF" />
      </svg>
    </span>
  );
}

export default function Logo({ tamanho = 34, comNome = true, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Marca tamanho={tamanho} />
      {comNome && (
        <span className="font-bold text-txt" style={{ fontSize: tamanho * 0.66, letterSpacing: '-0.025em', lineHeight: 1 }}>
          cont
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#C084FC,#8B5CF6)' }}>
            AI
          </span>
        </span>
      )}
    </span>
  );
}
