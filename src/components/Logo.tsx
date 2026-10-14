interface Props {
  tamanho?: number;
  comNome?: boolean;
  className?: string;
}

/** Símbolo circular inspirado na letra "C" com um ponto luminoso de IA. */
export function Marca({ tamanho = 34 }: { tamanho?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-[11px]"
      style={{
        width: tamanho,
        height: tamanho,
        backgroundImage: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 55%, #6D28D9 100%)',
        boxShadow: '0 6px 18px -6px rgba(124,58,237,.8), inset 0 1px 0 rgba(255,255,255,.25)',
      }}
      aria-hidden
    >
      <svg width={tamanho * 0.62} height={tamanho * 0.62} viewBox="0 0 24 24" fill="none">
        <path
          d="M17.2 7.4A6.6 6.6 0 1 0 17.2 16.6"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="18.4" cy="5.8" r="2.1" fill="#2DE2A6" />
      </svg>
    </span>
  );
}

export default function Logo({ tamanho = 34, comNome = true, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Marca tamanho={tamanho} />
      {comNome && (
        <span
          className="font-bold tracking-tight text-txt"
          style={{ fontSize: tamanho * 0.56, letterSpacing: '-0.02em' }}
        >
          cont
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg,#A855F7,#27D9D0)' }}
          >
            AI
          </span>
        </span>
      )}
    </span>
  );
}
