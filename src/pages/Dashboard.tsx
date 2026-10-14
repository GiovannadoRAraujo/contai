import { useMemo } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Bot, ChevronRight, Eye, EyeOff, FileUp, LineChart,
  PiggyBank, Target, TrendingUp, Wallet, AlertTriangle, CreditCard, Flag, Calculator,
} from 'lucide-react';
import { Barra, CabecalhoCard, Card, Valor, Variacao } from '@/components/ui';
import { BarrasComparativo, LinhaSaldo, MiniArea, Rosca } from '@/components/charts';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import {
  alertas, carteiraPorClasse, noMes, patrimonio, porCategoria, resumoMes,
  serieEstimadaPatrimonio, serieMeses, topCategorias,
} from '@/lib/finance';
import { brl, num, rotuloMes } from '@/lib/format';
import { corCategoria } from '@/lib/categorias';

export default function Dashboard() {
  const { estado, dispatch } = useApp();
  const { periodo, ir, abrir } = useNav();

  const resumo = useMemo(() => resumoMes(estado, periodo), [estado, periodo]);
  const movsMes = useMemo(() => noMes(estado.movimentacoes, periodo), [estado, periodo]);
  const categorias = useMemo(() => topCategorias(porCategoria(movsMes)), [movsMes]);
  const serie = useMemo(() => serieMeses(estado, periodo, 4), [estado, periodo]);
  const pat = useMemo(() => patrimonio(estado), [estado]);
  const carteira = useMemo(() => carteiraPorClasse(estado), [estado]);
  const evolucaoPat = useMemo(() => serieEstimadaPatrimonio(estado, 6), [estado]);
  const avisos = useMemo(() => alertas(estado), [estado]);
  const oculto = estado.usuario.ocultarValores;

  const variacaoPatrimonio = evolucaoPat.length > 1
    ? ((evolucaoPat.at(-1)!.v - evolucaoPat.at(-2)!.v) / (evolucaoPat.at(-2)!.v || 1)) * 100
    : 0;

  return (
    <div className="space-y-5 pb-8">
      {/* ------------------------- Cards de resumo ------------------------- */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5" aria-label="Resumo financeiro">
        <CardResumo
          icone={<Wallet size={17} />}
          cor="#8B5CF6"
          titulo="Saldo atual"
          valor={resumo.saldo}
          variacao={resumo.saldoVar}
          acao={
            <button
              type="button"
              onClick={() => dispatch({ t: 'usuario', dados: { ocultarValores: !oculto } })}
              aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}
              className="rounded-lg p-1 text-white/75 transition-colors hover:text-white xl:text-txt3 xl:hover:text-txt"
            >
              {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          destaque
        />
        <CardResumo icone={<ArrowUpCircle size={17} />} cor="#2DE2A6" titulo="Receitas do mês" valor={resumo.receitas} variacao={resumo.receitasVar} />
        <CardResumo icone={<ArrowDownCircle size={17} />} cor="#F052A0" titulo="Despesas do mês" valor={resumo.despesas} variacao={resumo.despesasVar} invertido />
        <CardResumo icone={<TrendingUp size={17} />} cor="#A855F7" titulo="Resultado líquido" valor={resumo.liquido} variacao={resumo.liquidoVar} />
        <Card className="p-4" hover>
          <div className="mb-3 flex items-start justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'rgba(255,159,67,.16)', color: '#FF9F43' }}>
              <AlertTriangle size={17} />
            </span>
          </div>
          <p className="text-[12.5px] text-txt2">Contas pendentes</p>
          <p className="mt-1 text-[20px] font-bold tracking-tight text-txt sm:text-[22px]">
            <Valor v={resumo.pendentesValor} />
          </p>
          <p className="mt-2 flex items-center gap-1.5 whitespace-nowrap text-[10.5px] sm:text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rosa" />
            <span className="font-semibold text-rosa">{resumo.vencendoSemana}</span>
            <span className="truncate text-txt3">
              {resumo.vencendoSemana === 1 ? 'vence esta semana' : 'vencem esta semana'}
            </span>
          </p>
        </Card>
      </section>

      {/* --------------------------- Gráficos --------------------------- */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-4">
          <CabecalhoCard titulo="Despesas por categoria" acao="Ver detalhes" onAcao={() => ir('movimentacoes')} />
          {categorias.length ? (
            <Rosca dados={categorias} total={resumo.despesas} />
          ) : (
            <p className="py-10 text-center text-[13px] text-txt2">Sem despesas registradas em {rotuloMes(periodo)}.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-4">
          <CabecalhoCard titulo="Receitas x Despesas" acao="Ver detalhes" onAcao={() => ir('movimentacoes')} />
          <BarrasComparativo dados={serie} />
        </Card>

        <Card className="p-5 lg:col-span-4">
          <CabecalhoCard titulo="Evolução do saldo" acao="Ver detalhes" onAcao={() => ir('planejamento')} />
          <p className="-mt-2 mb-2 text-[22px] font-bold tracking-tight text-txt">
            <Valor v={resumo.saldo} />
          </p>
          <LinhaSaldo dados={serie} altura={150} />
        </Card>
      </section>

      {/* ------------------------ Painéis inferiores ------------------------ */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Alertas */}
        <Card className="p-5 lg:col-span-3">
          <CabecalhoCard titulo="Alertas e lembretes" />
          {avisos.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-txt2">Nenhum alerta por enquanto.</p>
          ) : (
            <ul className="space-y-2.5">
              {avisos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => ir(a.tipo === 'meta' ? 'planejamento' : 'faturas')}
                    className="group flex w-full items-center gap-3 rounded-xl border border-line/70 bg-card2/60 p-3 text-left transition-all hover:border-roxo/50 hover:bg-card2"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${a.cor}22`, color: a.cor }}>
                      {a.tipo === 'cartao' ? <CreditCard size={16} /> : a.tipo === 'meta' ? <Flag size={16} /> : <AlertTriangle size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium leading-snug text-txt">{a.titulo}</span>
                      <span className="mt-0.5 block text-[11.5px] text-txt3">{a.detalhe}</span>
                      {a.progresso !== undefined && (
                        <span className="mt-2 block">
                          <Barra pct={a.progresso} cor={a.cor} altura={4} />
                        </span>
                      )}
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-txt3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Investimentos */}
        <Card className="p-5 lg:col-span-5">
          <CabecalhoCard titulo="Investimentos" acao="Ver carteira" onAcao={() => ir('investimentos')} />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-[24px] font-bold tracking-tight text-txt"><Valor v={pat.total} /></p>
            <p className="flex items-center gap-2 text-[11.5px] text-txt3">
              Patrimônio total
              <Variacao v={variacaoPatrimonio} sufixo="vs. mês anterior" />
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 sm:w-[54%]">
              {carteira.length ? (
                <Rosca dados={carteira} total={pat.total} rotuloCentro="Investido" altura={118} />
              ) : (
                <p className="text-[13px] text-txt2">Nenhum ativo cadastrado.</p>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <MiniArea dados={evolucaoPat} altura={118} />
              <p className="mt-1 text-[10.5px] leading-snug text-txt3">
                Evolução estimada a partir da rentabilidade informada em cada ativo.
              </p>
            </div>
          </div>
        </Card>

        {/* Ações rápidas */}
        <Card className="p-5 lg:col-span-4">
          <CabecalhoCard titulo="Ações rápidas" />
          <div className="grid grid-cols-4 gap-2.5">
            <Atalho icone={<ArrowUpCircle size={18} />} cor="#2DE2A6" rotulo="Adicionar receita" onClick={() => abrir('receita')} />
            <Atalho icone={<ArrowDownCircle size={18} />} cor="#F052A0" rotulo="Adicionar despesa" onClick={() => abrir('despesa')} />
            <Atalho icone={<FileUp size={18} />} cor="#8B5CF6" rotulo="Enviar fatura" onClick={() => ir('faturas')} />
            <Atalho icone={<Target size={18} />} cor="#A855F7" rotulo="Criar meta" onClick={() => abrir('meta')} />
            <Atalho icone={<PiggyBank size={18} />} cor="#27D9D0" rotulo="Cadastrar investimento" onClick={() => abrir('investimento')} />
            <Atalho icone={<Calculator size={18} />} cor="#FF9F43" rotulo="Simular rendimento" onClick={() => abrir('simulador')} />
            <Atalho icone={<Bot size={18} />} cor="#8B5CF6" rotulo="Conversar com a IA" onClick={() => ir('assistente')} />
          </div>
        </Card>
      </section>

      {/* ---------------------- Resumo rápido do mês ---------------------- */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-7">
          <CabecalhoCard titulo="Últimas movimentações" acao="Ver todas" onAcao={() => ir('movimentacoes')} />
          {movsMes.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-txt2">
              Nenhuma movimentação em {rotuloMes(periodo)}.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {movsMes.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: corCategoria(m.categoria) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-txt">{m.descricao}</span>
                    <span className="block text-[11.5px] text-txt3">{m.categoria} · {estado.contas.find((c) => c.id === m.contaId)?.nome ?? '—'}</span>
                  </span>
                  <span className={`shrink-0 text-[13px] font-semibold ${m.tipo === 'receita' ? 'text-verde' : 'text-rosa'}`}>
                    {m.tipo === 'receita' ? '+' : '−'} {oculto ? 'R$ ••••' : brl(m.valor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-5">
          <CabecalhoCard titulo="Orçamento do mês" acao="Planejar" onAcao={() => ir('planejamento')} icone={<LineChart size={16} className="text-roxo-luz" />} />
          <ul className="space-y-3">
            {estado.orcamentos.slice(0, 5).map((o) => {
              const gasto = movsMes.filter((m) => m.tipo === 'despesa' && m.categoria === o.categoria).reduce((t, m) => t + m.valor, 0);
              const pct = o.limite ? (gasto / o.limite) * 100 : 0;
              return (
                <li key={o.categoria}>
                  <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                    <span className="text-txt2">{o.categoria}</span>
                    <span className={pct > 100 ? 'font-semibold text-rosa' : 'text-txt3'}>
                      {oculto ? '••••' : `${brl(gasto)} / ${brl(o.limite)}`} · {num(pct, 0)}%
                    </span>
                  </div>
                  <Barra pct={pct} cor={pct > 100 ? '#F052A0' : corCategoria(o.categoria)} altura={5} />
                </li>
              );
            })}
            {estado.orcamentos.length === 0 && (
              <li className="py-4 text-center text-[13px] text-txt2">Nenhum orçamento definido ainda.</li>
            )}
          </ul>
        </Card>
      </section>
    </div>
  );
}

/* ---------------------------- Componentes ---------------------------- */
function CardResumo({
  icone, cor, titulo, valor, variacao, invertido = false, acao, destaque = false,
}: {
  icone: React.ReactNode; cor: string; titulo: string; valor: number; variacao: number;
  invertido?: boolean; acao?: React.ReactNode; destaque?: boolean;
}) {
  // No mobile, o card de saldo ocupa a largura toda e ganha o gradiente roxo da referência.
  const classesDestaque = destaque
    ? 'col-span-2 border-roxo/45 bg-[linear-gradient(135deg,#7C3AED_0%,#6D28D9_58%,#4C1D95_100%)] xl:col-span-1 xl:border-line/70 xl:bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))]'
    : '';

  return (
    <Card className={`p-4 ${classesDestaque}`} hover>
      <div className="mb-3 flex items-start justify-between">
        {destaque ? (
          <>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white xl:hidden">{icone}</span>
            <span className="hidden h-9 w-9 place-items-center rounded-xl xl:grid" style={{ background: `${cor}29`, color: cor }}>{icone}</span>
          </>
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${cor}29`, color: cor }}>
            {icone}
          </span>
        )}
        {acao}
      </div>
      <p className={`text-[12.5px] ${destaque ? 'text-white/75 xl:text-txt2' : 'text-txt2'}`}>{titulo}</p>
      <p className={`mt-1 font-bold tracking-tight ${destaque ? 'text-[23px] text-white xl:text-txt' : 'text-[20px] text-txt sm:text-[22px]'}`}>
        <Valor v={valor} />
      </p>
      <p className="mt-2"><Variacao v={variacao} invertido={invertido} tomClaro={destaque} /></p>
    </Card>
  );
}

function Atalho({ icone, cor, rotulo, onClick }: { icone: React.ReactNode; cor: string; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      className="group flex flex-col items-center gap-2 rounded-xl border border-line/70 bg-card2/50 px-1.5 py-3 transition-all hover:-translate-y-0.5 hover:border-roxo/50 hover:bg-card2"
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-xl transition-transform group-hover:scale-110"
        style={{ background: `${cor}1f`, color: cor, boxShadow: `0 0 0 1px ${cor}2a` }}
      >
        {icone}
      </span>
      <span className="text-center text-[10.5px] font-medium leading-tight text-txt2 group-hover:text-txt">{rotulo}</span>
    </button>
  );
}

