import { useMemo, useState } from 'react';
import { Info, ListChecks, Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Campo, Entrada, Selecao } from './ui';
import { LinhaSaldo } from './charts';
import { useApp } from '@/store/app';
import { brl, dataBR, hoje, num, parseBRL } from '@/lib/format';
import { simular, type Indexador } from '@/lib/simulador';
import { buscarTaxasBCB, taxasAtuais, type ChaveTaxa, type TaxaEmUso } from '@/lib/taxas';

const ABAS: Indexador[] = ['CDI', 'Prefixado', 'IPCA+', 'Selic', 'Personalizado'];
const PRAZOS = [3, 6, 12, 18, 24, 36, 48, 60, 120];

const CHAVE: Partial<Record<Indexador, ChaveTaxa>> = { CDI: 'CDI', Selic: 'SELIC', 'IPCA+': 'IPCA' };

export default function Simulador({ compacto = false }: { compacto?: boolean }) {
  const { estado, dispatch, avisar } = useApp();
  const [indexador, setIndexador] = useState<Indexador>('CDI');
  const [valorInicial, setValorInicial] = useState('5.000,00');
  const [aporte, setAporte] = useState('');
  const [meses, setMeses] = useState(12);
  const [percentual, setPercentual] = useState('100');
  const [taxa, setTaxa] = useState('11,00');
  const [isento, setIsento] = useState(false);
  const [custodia, setCustodia] = useState('0');
  const [refManual, setRefManual] = useState<Partial<Record<ChaveTaxa, string>>>({});
  const [premissasAbertas, setPremissasAbertas] = useState(!compacto);
  const [buscando, setBuscando] = useState(false);

  const chave = CHAVE[indexador];
  const taxasBase = taxasAtuais(estado.prefs);
  const taxas = useMemo(() => {
    const t = { ...taxasBase };
    for (const k of Object.keys(refManual) as ChaveTaxa[]) {
      const v = parseBRL(refManual[k] ?? '');
      if (refManual[k] !== undefined && v > 0) t[k] = { valor: v, fonte: 'Informada por você', data: hoje(), origem: 'manual' };
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.prefs.taxas, refManual]);

  const erros = {
    valor: parseBRL(valorInicial) < 0 ? 'Valor inválido.' : !parseBRL(valorInicial) && !parseBRL(aporte) ? 'Informe um valor inicial ou um aporte.' : undefined,
    taxa: !chave && !(parseBRL(taxa) > -100) ? 'Informe a taxa.' : undefined,
  };

  const r = useMemo(
    () => simular({
      indexador,
      valorInicial: parseBRL(valorInicial),
      aporteMensal: parseBRL(aporte),
      meses,
      taxaAnual: parseBRL(taxa),
      percentualIndexador: parseBRL(percentual) || 100,
      isentoIR: isento,
      taxaCustodiaAnual: parseBRL(custodia),
    }, taxas),
    [indexador, valorInicial, aporte, meses, taxa, percentual, isento, custodia, taxas],
  );

  const referencia: TaxaEmUso | null = chave ? taxas[chave] : null;
  const ganhoPct = r.totalAportado ? (r.rendimentoLiquido / r.totalAportado) * 100 : 0;

  const serieGrafico = useMemo(() => {
    const passo = Math.max(1, Math.ceil(r.serie.length / 13));
    return r.serie
      .filter((_, i) => i % passo === 0 || i === r.serie.length - 1)
      .map((p) => ({ mes: p.rotulo, saldo: p.bruto, aportado: p.aportado }));
  }, [r.serie]);

  const atualizarTaxas = async () => {
    setBuscando(true);
    try {
      const novas = await buscarTaxasBCB();
      dispatch({ t: 'prefs', dados: { taxas: { ...estado.prefs.taxas, ...novas } } });
      setRefManual({});
      avisar(`Taxas atualizadas pelo Banco Central: ${Object.keys(novas).join(', ')}.`);
    } catch (e) {
      avisar(`Não foi possível consultar o Banco Central agora (${e instanceof Error ? e.message : 'erro de rede'}). Use a taxa de referência ou informe manualmente.`, 'erro');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Abas */}
      <div className="grid grid-cols-5 gap-1 rounded-xl border border-line bg-card2/60 p-1" role="tablist" aria-label="Tipo de rendimento">
        {ABAS.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={indexador === a} onClick={() => setIndexador(a)}
            className={clsx('truncate rounded-lg px-1 py-1.5 text-[11.5px] font-semibold transition-colors sm:text-[12.5px]',
              indexador === a ? 'bg-gradient-to-br from-roxo to-roxo-luz text-white shadow-glowsm' : 'text-txt2 hover:text-txt')}>
            {a}
          </button>
        ))}
      </div>

      <div className={clsx('grid gap-4', !compacto && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
        {/* Parâmetros */}
        <div className="space-y-3">
          <Campo rotulo="Valor inicial (R$)" erro={erros.valor}>
            <Entrada value={valorInicial} onChange={(e) => setValorInicial(e.target.value)} inputMode="decimal" placeholder="5.000,00" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Aporte mensal (opcional)">
              <Entrada value={aporte} onChange={(e) => setAporte(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </Campo>
            <Campo rotulo="Prazo">
              <Selecao value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
                {PRAZOS.map((v) => <option key={v} value={v}>{v} meses{v >= 24 ? ` (${v / 12} anos)` : ''}</option>)}
              </Selecao>
            </Campo>
          </div>

          {chave ? (
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={indexador === 'IPCA+' ? 'Taxa real acima do IPCA (% a.a.)' : `Percentual do ${indexador} (%)`}>
                {indexador === 'IPCA+'
                  ? <Entrada value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" placeholder="6,00" />
                  : <Entrada value={percentual} onChange={(e) => setPercentual(e.target.value)} inputMode="decimal" placeholder="100" />}
              </Campo>
              <Campo rotulo={`${indexador === 'IPCA+' ? 'IPCA 12m' : indexador} considerado (% a.a.)`}>
                <Entrada
                  value={refManual[chave] ?? num(taxasBase[chave].valor, 2)}
                  onChange={(e) => setRefManual((m) => ({ ...m, [chave]: e.target.value }))}
                  inputMode="decimal"
                />
              </Campo>
            </div>
          ) : (
            <Campo rotulo={indexador === 'Prefixado' ? 'Taxa prefixada (% a.a.)' : 'Taxa de rendimento (% a.a.)'} erro={erros.taxa}>
              <Entrada value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" placeholder="11,00" />
            </Campo>
          )}

          {!compacto && (
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Custódia/adm. (% a.a.)" dica="Ex.: 0,20 no Tesouro Direto">
                <Entrada value={custodia} onChange={(e) => setCustodia(e.target.value)} inputMode="decimal" placeholder="0" />
              </Campo>
              <label className="flex items-end pb-3">
                <span className="flex items-center gap-2 text-[12.5px] text-txt2">
                  <input type="checkbox" checked={isento} onChange={(e) => setIsento(e.target.checked)} className="h-4 w-4 accent-[#7C3AED]" />
                  Isento de IR (LCI/LCA)
                </span>
              </label>
            </div>
          )}

          {referencia && (
            <div className="rounded-xl border border-line bg-card2/40 p-3 text-[11.5px] leading-snug text-txt2">
              <p className="flex items-start gap-1.5">
                <Info size={13} className={clsx('mt-0.5 shrink-0', referencia.origem === 'bcb' ? 'text-verde' : 'text-laranja')} />
                <span>
                  {referencia.origem === 'bcb' && <>Fonte externa: <strong className="text-txt">{referencia.fonte}</strong>, dado de {dataBR(referencia.data)}.</>}
                  {referencia.origem === 'referencia' && <><strong className="text-laranja">Taxa ilustrativa.</strong> {referencia.fonte}, de {dataBR(referencia.data)} — pode estar desatualizada.</>}
                  {referencia.origem === 'manual' && <><strong className="text-laranja">Taxa informada por você.</strong> Simulação ilustrativa.</>}
                </span>
              </p>
              <button type="button" onClick={() => void atualizarTaxas()} disabled={buscando}
                className="mt-2 inline-flex items-center gap-1.5 font-semibold text-roxo-luz hover:text-txt disabled:opacity-60">
                {buscando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {buscando ? 'Consultando o Banco Central…' : 'Atualizar taxas pelo Banco Central'}
              </button>
            </div>
          )}
        </div>

        {/* Resultado */}
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-card2/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] text-txt2">Patrimônio final estimado</p>
                <p className="mt-0.5 text-[24px] font-bold tracking-tight text-txt">{brl(r.patrimonioFinal)}</p>
              </div>
              <span className={clsx('mt-1 text-[12px] font-semibold', ganhoPct >= 0 ? 'text-verde' : 'text-rosa')}>
                {ganhoPct >= 0 ? '↑' : '↓'} {num(Math.abs(ganhoPct), 1)}% líquido
              </span>
            </div>
            <LinhaSaldo dados={serieGrafico} altura={compacto ? 130 : 160} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Resultado rotulo="Total investido" valor={r.totalAportado} />
            <Resultado rotulo="Rendimento bruto" valor={r.rendimentoBruto} cor="#27D9D0" />
            <Resultado
              rotulo={`Impostos estimados${r.aliquotasIR.length ? ` (IR ${r.aliquotasIR.map((a) => num(a, 1)).join('/')}%)` : ''}`}
              valor={-(r.impostoIR + r.iof)} cor="#F052A0" />
            <Resultado rotulo="Custos estimados" valor={-r.custodia} cor="#FF9F43" />
            <Resultado rotulo="Rendimento líquido" valor={r.rendimentoLiquido} cor="#2DE2A6" />
            <Resultado rotulo={`Taxa efetiva (${num(r.taxaMensal, 3)}% a.m.)`} texto={`${num(r.taxaAnualEfetiva, 2)}% a.a.`} />
          </div>

          <div>
            <button type="button" onClick={() => setPremissasAbertas((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-roxo-luz hover:text-txt">
              <ListChecks size={14} /> {premissasAbertas ? 'Ocultar premissas do cálculo' : 'Ver premissas do cálculo'}
            </button>
            {premissasAbertas && (
              <ul className="mt-2 animate-fadeUp space-y-1.5 rounded-xl border border-line bg-card2/40 p-3.5">
                {r.premissas.map((p) => (
                  <li key={p} className="flex gap-2 text-[11.5px] leading-relaxed text-txt2">
                    <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-roxo-luz" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10.5px] leading-relaxed text-txt3">
        Estimativa ilustrativa, recalculada a cada alteração. Valores líquidos dependem de regras do produto e da sua
        situação tributária. Projeções não garantem rentabilidade futura e não são oferta ou recomendação de investimento.
      </p>
    </div>
  );
}

function Resultado({ rotulo, valor, texto, cor = '#F5F7FF' }: { rotulo: string; valor?: number; texto?: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card2/50 p-3">
      <p className="text-[10.5px] leading-tight text-txt3">{rotulo}</p>
      <p className="mt-1 text-[13.5px] font-bold" style={{ color: cor }}>
        {texto ?? (valor! < 0 ? `− ${brl(Math.abs(valor!))}` : brl(valor ?? 0))}
      </p>
    </div>
  );
}
