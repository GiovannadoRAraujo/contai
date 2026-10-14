import { useMemo, useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Campo, Entrada, Selecao } from './ui';
import { BarrasProjecao } from './charts';
import { brl, dataBR, num, parseBRL } from '@/lib/format';
import { simular, TAXAS_REFERENCIA, type Indexador } from '@/lib/simulador';

const ABAS: Indexador[] = ['CDI', 'Prefixado', 'IPCA+', 'Selic', 'Personalizado'];

const PRAZOS = [
  [6, '6 meses'], [12, '12 meses'], [24, '24 meses'], [36, '36 meses'], [60, '60 meses'],
] as const;

export default function Simulador({ compacto = false }: { compacto?: boolean }) {
  const [indexador, setIndexador] = useState<Indexador>('CDI');
  const [valorInicial, setValorInicial] = useState('5.000,00');
  const [aporte, setAporte] = useState('200,00');
  const [meses, setMeses] = useState(12);
  const [percentual, setPercentual] = useState('100');
  const [taxa, setTaxa] = useState('11,00');
  const [isento, setIsento] = useState(false);
  const [custodia, setCustodia] = useState('0');
  const [premissasAbertas, setPremissasAbertas] = useState(false);

  const usaPercentual = indexador === 'CDI' || indexador === 'Selic';
  const rotuloTaxa = indexador === 'IPCA+' ? 'Taxa real acima do IPCA (% a.a.)' : 'Taxa de rendimento (% a.a.)';

  const r = useMemo(
    () =>
      simular({
        indexador,
        valorInicial: parseBRL(valorInicial),
        aporteMensal: parseBRL(aporte),
        meses,
        taxaAnual: parseBRL(taxa),
        percentualIndexador: parseBRL(percentual) || 100,
        isentoIR: isento,
        taxaCustodiaAnual: parseBRL(custodia),
      }),
    [indexador, valorInicial, aporte, meses, taxa, percentual, isento, custodia],
  );

  const referencia =
    indexador === 'CDI' ? TAXAS_REFERENCIA.CDI
      : indexador === 'Selic' ? TAXAS_REFERENCIA.SELIC
        : indexador === 'IPCA+' ? TAXAS_REFERENCIA.IPCA
          : null;

  const serieGrafico = useMemo(() => {
    const passo = Math.max(1, Math.ceil(r.serie.length / 12));
    return r.serie.filter((_, i) => i % passo === 0 || i === r.serie.length - 1);
  }, [r.serie]);

  return (
    <div className="space-y-4">
      {/* Abas */}
      <div className="flex flex-wrap gap-1.5">
        {ABAS.map((a) => (
          <button key={a} type="button" onClick={() => setIndexador(a)} className={clsx('chip', indexador === a && 'chip-on')}>
            {a}
          </button>
        ))}
      </div>

      <p className="text-[12.5px] text-txt2">Simule quanto o seu dinheiro pode render.</p>

      {/* Parâmetros */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Valor inicial">
          <Entrada value={valorInicial} onChange={(e) => setValorInicial(e.target.value)} inputMode="decimal" placeholder="R$ 5.000,00" />
        </Campo>
        <Campo rotulo="Aporte mensal (opcional)">
          <Entrada value={aporte} onChange={(e) => setAporte(e.target.value)} inputMode="decimal" placeholder="R$ 0,00" />
        </Campo>
        <Campo rotulo="Prazo">
          <Selecao value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
            {PRAZOS.map(([v, r2]) => <option key={v} value={v}>{r2}</option>)}
          </Selecao>
        </Campo>
        {usaPercentual ? (
          <Campo rotulo={`Percentual do ${indexador}`}>
            <Entrada value={percentual} onChange={(e) => setPercentual(e.target.value)} inputMode="decimal" placeholder="100" />
          </Campo>
        ) : (
          <Campo rotulo={rotuloTaxa}>
            <Entrada value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" placeholder="11,00" />
          </Campo>
        )}
        {!compacto && (
          <>
            <Campo rotulo="Taxa de custódia (% a.a.)" dica="Ex.: 0,20% no Tesouro Direto">
              <Entrada value={custodia} onChange={(e) => setCustodia(e.target.value)} inputMode="decimal" placeholder="0" />
            </Campo>
            <label className="flex items-end pb-2.5">
              <span className="flex items-center gap-2 text-[12.5px] text-txt2">
                <input type="checkbox" checked={isento} onChange={(e) => setIsento(e.target.checked)}
                  className="h-4 w-4 rounded border-line bg-card2 accent-[#7C3AED]" />
                Produto isento de IR (LCI, LCA, poupança)
              </span>
            </label>
          </>
        )}
      </div>

      {referencia && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-txt3">
          <Info size={13} className="mt-0.5 shrink-0 text-roxo-luz" />
          Taxa de referência do {indexador === 'IPCA+' ? 'IPCA' : indexador}: {num(referencia.valor, 2)}% a.a.
          ({dataBR(referencia.data)}) — Fonte: {referencia.fonte}. Valor armazenado no aplicativo, sem integração em tempo real:
          ajuste manualmente se o cenário mudou.
        </p>
      )}

      <div className="rounded-xl border border-line bg-card2/50 p-3">
        <p className="text-[12px] text-txt2">
          Taxa efetiva aplicada: <strong className="text-txt">{num(r.taxaAnualEfetiva, 2)}% a.a.</strong>{' '}
          (<span className="text-txt3">{num(r.taxaMensal, 3)}% a.m.</span>)
        </p>
      </div>

      {/* Resultado */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[14px] font-semibold text-txt">Resultado da simulação</h4>
          <button type="button" onClick={() => setPremissasAbertas((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-roxo-luz hover:text-txt">
            <RefreshCw size={12} /> {premissasAbertas ? 'Ocultar premissas' : 'Ver premissas'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Resultado rotulo="Total aportado" valor={r.totalAportado} />
          <Resultado rotulo="Rendimento bruto" valor={r.rendimentoBruto} cor="#27D9D0" />
          <Resultado rotulo={`Impostos (estimado${r.aliquotaIR ? `, IR ${num(r.aliquotaIR, 1)}%` : ''})`} valor={-(r.impostoIR + r.iof)} cor="#F052A0" />
          <Resultado rotulo="Rendimento líquido" valor={r.rendimentoLiquido} cor="#2DE2A6" />
          <Resultado rotulo="Custos de custódia" valor={-r.custodia} cor="#FF9F43" />
          <Resultado rotulo="Patrimônio final" valor={r.patrimonioFinal} cor="#A855F7" destaque />
        </div>

        {premissasAbertas && (
          <ul className="mt-3 animate-fadeUp space-y-1.5 rounded-xl border border-line bg-card2/50 p-3.5">
            {r.premissas.map((p) => (
              <li key={p} className="flex gap-2 text-[11.5px] leading-relaxed text-txt2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-roxo-luz" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-[12px] font-medium text-txt2">Evolução do patrimônio projetado</p>
        <BarrasProjecao dados={serieGrafico} altura={compacto ? 140 : 170} />
      </div>

      <p className="text-[10.5px] leading-relaxed text-txt3">
        Simulação ilustrativa. Projeções não garantem rentabilidade futura e não constituem oferta ou recomendação
        de investimento.
      </p>
    </div>
  );
}

function Resultado({ rotulo, valor, cor = '#F5F7FF', destaque = false }: { rotulo: string; valor: number; cor?: string; destaque?: boolean }) {
  return (
    <div className={clsx('rounded-xl border p-3', destaque ? 'border-roxo/40 bg-roxo/10' : 'border-line bg-card2/50')}>
      <p className="text-[10.5px] leading-tight text-txt3">{rotulo}</p>
      <p className="mt-1 text-[14px] font-bold" style={{ color: cor }}>{brl(valor)}</p>
    </div>
  );
}
