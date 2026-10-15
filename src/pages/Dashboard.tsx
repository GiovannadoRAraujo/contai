import { useMemo } from 'react';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Bell, Bot, Calculator, ChevronRight, CreditCard, Database,
  Eye, EyeOff, FileUp, PiggyBank, ReceiptText, Target, TrendingUp, Wallet, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { Barra, CabecalhoCard, Card, Valor, Variacao } from '@/components/ui';
import { BarrasComparativo, LinhaSaldo, MiniArea, Rosca } from '@/components/charts';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import {
  alertas, carteiraPorClasse, noMes, patrimonio, porCategoria, resumoMes,
  serieEstimadaPatrimonio, serieMeses, topCategorias, type Alerta,
} from '@/lib/finance';
import { brl, plural, rotuloMes } from '@/lib/format';

export default function Dashboard() {
  const { estado, dispatch } = useApp();
  const { periodo, ir, abrir } = useNav();

  const resumo = useMemo(() => resumoMes(estado, periodo), [estado, periodo]);
  const movsMes = useMemo(() => noMes(estado.movimentacoes, periodo), [estado, periodo]);
  const categorias = useMemo(() => topCategorias(porCategoria(movsMes)), [movsMes]);
  const serie = useMemo(() => serieMeses(estado, periodo, 6), [estado, periodo]);
  const pat = useMemo(() => patrimonio(estado), [estado]);
  const carteira = useMemo(() => carteiraPorClasse(estado), [estado]);
  const evolucaoPat = useMemo(() => serieEstimadaPatrimonio(estado, 6), [estado]);
  const avisos = useMemo(() => alertas(estado), [estado]);
  const oculto = estado.prefs.ocultarValores;
  const semDados = estado.movimentacoes.length === 0;

  const variacaoPatrimonio = pat.total ? pat.rentabilidadeMedia : null;

  const alternarOcultos = () => dispatch({ t: 'prefs', dados: { ocultarValores: !oculto } });

  return (
    <div className="space-y-4 pb-8 lg:space-y-5">
      {semDados && <BoasVindas />}

      {/* ------------------------- Cards de resumo ------------------------- */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5 xl:gap-4" aria-label="Resumo financeiro">
        <CardResumo
          icone={<Wallet size={16} />}
          cor="#8B5CF6"
          titulo="Saldo atual"
          valor={<Valor v={resumo.saldo} />}
          rodape={<Variacao v={resumo.saldoVar} tomClaro />}
          acao={
            <button type="button" onClick={alternarOcultos} aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}
              className="rounded-lg p-1 text-white/80 transition-colors hover:text-white xl:text-txt3 xl:hover:text-txt">
              {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          destaque
        />
        <CardResumo icone={<ArrowUpCircle size={16} />} cor="#2DE2A6" titulo="Receitas do mês" tituloCurto="Receitas"
          valor={<Valor v={resumo.receitas} />} rodape={<Variacao v={resumo.receitasVar} />} />
        <CardResumo icone={<ArrowDownCircle size={16} />} cor="#F052A0" titulo="Despesas do mês" tituloCurto="Despesas"
          valor={<Valor v={resumo.despesas} />} rodape={<Variacao v={resumo.despesasVar} invertido />} />
        <CardResumo icone={<TrendingUp size={16} />} cor="#A855F7" titulo="Resultado líquido" tituloCurto="Resultado"
          valor={<Valor v={resumo.liquido} className={resumo.liquido < 0 ? 'text-rosa' : ''} />}
          rodape={
            resumo.receitas || resumo.despesas
              ? <span className={clsx('text-[10.5px] font-semibold sm:text-xs', resumo.liquido >= 0 ? 'text-verde' : 'text-rosa')}>
                {resumo.liquido >= 0 ? 'Positivo no mês' : 'Negativo no mês'}
              </span>
              : <span className="text-[10.5px] text-txt3 sm:text-xs">Sem lançamentos no mês</span>
          } />
        <CardResumo icone={<ReceiptText size={16} />} cor="#FF9F43" titulo="Contas pendentes" tituloCurto="Pendentes"
          valor={<Valor v={resumo.pendentesValor} />}
          rodape={
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10.5px] sm:text-xs">
              {resumo.vencendoSemana > 0 && <AlertTriangle size={12} className="text-laranja" />}
              <span className={resumo.vencendoSemana ? 'font-semibold text-laranja' : 'text-txt3'}>
                {resumo.pendentesQtd === 0 ? 'Nenhuma conta em aberto' : `${plural(resumo.vencendoSemana, 'vencimento próximo', 'vencimentos próximos')}`}
              </span>
            </span>
          } />
      </section>

      {/* --------------------------- Gráficos --------------------------- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Card className="order-1 p-5 lg:col-span-4">
          <CabecalhoCard titulo="Despesas por categoria" acao="Ver detalhes" onAcao={() => ir('movimentacoes')} />
          {categorias.length ? (
            <Rosca dados={categorias} total={resumo.despesas} altura={172} />
          ) : (
            <GraficoVazio texto={`Sem despesas registradas em ${rotuloMes(periodo)}.`} acao="Adicionar despesa" onAcao={() => abrir('despesa')} />
          )}
        </Card>

        {/* Ações rápidas no mobile (4 atalhos, como na referência) */}
        <Card className="order-2 p-4 lg:hidden">
          <CabecalhoCard titulo="Ações rápidas" />
          <div className="grid grid-cols-4 gap-2">
            <AtalhoIcone icone={<ArrowUpCircle size={20} />} cor="#2DE2A6" rotulo="Receita" onClick={() => abrir('receita')} />
            <AtalhoIcone icone={<ArrowDownCircle size={20} />} cor="#F052A0" rotulo="Despesa" onClick={() => abrir('despesa')} />
            <AtalhoIcone icone={<FileUp size={20} />} cor="#8B5CF6" rotulo="Fatura" onClick={() => ir('faturas', { acao: 'upload' })} />
            <AtalhoIcone icone={<Target size={20} />} cor="#A855F7" rotulo="Meta" onClick={() => abrir('meta')} />
          </div>
        </Card>

        <Card className="order-3 p-5 lg:col-span-4">
          <CabecalhoCard titulo="Receitas x despesas" acao="Ver detalhes" onAcao={() => ir('movimentacoes')} />
          {serie.some((s) => s.receitas || s.despesas)
            ? <BarrasComparativo dados={serie} />
            : <GraficoVazio texto="Os meses aparecem aqui assim que houver receitas ou despesas." />}
        </Card>

        <Card className="order-4 p-5 lg:col-span-4">
          <CabecalhoCard titulo="Evolução do saldo" acao="Ver detalhes" onAcao={() => ir('movimentacoes')} />
          {semDados && !estado.contas.some((c) => c.saldoInicial) ? (
            <GraficoVazio texto="Registre movimentações para acompanhar a evolução do saldo." />
          ) : (
            <LinhaSaldo dados={serie} altura={206} destacarUltimo />
          )}
        </Card>
      </section>

      {/* ------------------------ Painéis inferiores ------------------------ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Card className="p-5 lg:col-span-4">
          <CabecalhoCard titulo="Alertas e lembretes" />
          <ListaAlertas avisos={avisos} oculto={oculto} />
        </Card>

        <Card className="p-5 lg:col-span-5">
          <CabecalhoCard titulo="Investimentos" acao="Ver carteira" onAcao={() => ir('investimentos')} />
          {pat.total === 0 ? (
            <GraficoVazio texto="Nenhum investimento cadastrado. O cadastro é manual e não depende de corretora." acao="Cadastrar investimento" onAcao={() => abrir('investimento')} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center">
                <div className="rounded-xl border border-line/70 bg-card2/60 p-3.5">
                  <p className="text-[11.5px] text-txt3">Patrimônio total</p>
                  <p className="mt-1 text-[21px] font-bold tracking-tight text-txt"><Valor v={pat.total} /></p>
                  <p className="mt-1"><Variacao v={variacaoPatrimonio} sufixo="rentab. informada" /></p>
                </div>
                <Rosca dados={carteira} total={pat.total} rotuloCentro="Investido" altura={104} semCentro />
              </div>
              <p className="mb-1 mt-4 text-[12px] font-medium text-txt2">Evolução do patrimônio</p>
              <MiniArea dados={evolucaoPat} altura={92} comEixo />
              <p className="mt-1 text-[10.5px] leading-snug text-txt3">
                Estimativa reconstruída a partir da rentabilidade que você informou em cada ativo.
              </p>
            </>
          )}
        </Card>

        <Card className="hidden p-5 lg:col-span-3 lg:block">
          <CabecalhoCard titulo="Ações rápidas" />
          <div className="space-y-2">
            <AtalhoLinha icone={<ArrowUpCircle size={15} />} cor="#2DE2A6" rotulo="Adicionar receita" onClick={() => abrir('receita')} />
            <AtalhoLinha icone={<ArrowDownCircle size={15} />} cor="#F052A0" rotulo="Adicionar despesa" onClick={() => abrir('despesa')} />
            <AtalhoLinha icone={<FileUp size={15} />} cor="#8B5CF6" rotulo="Enviar fatura" onClick={() => ir('faturas', { acao: 'upload' })} />
            <AtalhoLinha icone={<Target size={15} />} cor="#A855F7" rotulo="Criar meta" onClick={() => abrir('meta')} />
            <AtalhoLinha icone={<PiggyBank size={15} />} cor="#27D9D0" rotulo="Cadastrar investimento" onClick={() => abrir('investimento')} />
            <AtalhoLinha icone={<Calculator size={15} />} cor="#FF9F43" rotulo="Simular rendimento" onClick={() => abrir('simulador')} />
            <AtalhoLinha icone={<Bot size={15} />} cor="#8B5CF6" rotulo="Conversar com a IA" onClick={() => ir('assistente')} />
          </div>
        </Card>

        {/* No mobile, os demais atalhos ficam numa linha compacta */}
        <Card className="p-4 lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            <AtalhoIcone icone={<PiggyBank size={18} />} cor="#27D9D0" rotulo="Investimento" onClick={() => abrir('investimento')} />
            <AtalhoIcone icone={<Calculator size={18} />} cor="#FF9F43" rotulo="Simular" onClick={() => abrir('simulador')} />
            <AtalhoIcone icone={<Bot size={18} />} cor="#8B5CF6" rotulo="Assistente" onClick={() => ir('assistente')} />
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ---------------------------- Componentes ---------------------------- */
function BoasVindas() {
  const { dispatch, avisar } = useApp();
  const { abrir, ir } = useNav();
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-roxo/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-roxo/40 bg-roxo/10 px-2.5 py-1 text-[11px] font-semibold text-roxo-luz">
            <Zap size={12} /> Primeiros passos
          </p>
          <h2 className="mt-3 text-[18px] font-bold text-txt">Comece a organizar suas finanças</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-txt2">
            Ainda não há movimentações registradas. Os indicadores e gráficos abaixo são calculados a partir dos seus
            lançamentos e ficam salvos neste navegador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => abrir('receita')}><ArrowUpCircle size={15} /> Adicionar receita</button>
          <button type="button" className="btn-ghost" onClick={() => abrir('despesa')}><ArrowDownCircle size={15} /> Adicionar despesa</button>
          <button type="button" className="btn-ghost" onClick={() => ir('faturas', { acao: 'upload' })}><FileUp size={15} /> Enviar fatura</button>
          <button
            type="button"
            className="btn border border-laranja/40 bg-laranja/10 text-laranja hover:bg-laranja/20"
            onClick={() => { dispatch({ t: 'demo.carregar' }); avisar('Dados de demonstração (fictícios) carregados. Você pode removê-los quando quiser.', 'info'); }}
          >
            <Database size={15} /> Carregar dados de demonstração
          </button>
        </div>
      </div>
    </Card>
  );
}

function CardResumo({
  icone, cor, titulo, tituloCurto, valor, rodape, acao, destaque = false,
}: {
  icone: React.ReactNode; cor: string; titulo: string; tituloCurto?: string; valor: React.ReactNode; rodape: React.ReactNode;
  acao?: React.ReactNode; destaque?: boolean;
}) {
  // No mobile, o card de saldo ocupa a largura toda e ganha o gradiente roxo da referência.
  const classesDestaque = destaque
    ? 'col-span-2 border-roxo/50 bg-[linear-gradient(135deg,#8B5CF6_0%,#7C3AED_45%,#5B21B6_100%)] shadow-glow xl:col-span-1 xl:border-line/70 xl:bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))] xl:shadow-card'
    : '';

  return (
    <Card className={clsx('p-4 xl:p-[18px]', classesDestaque)} hover>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-[10px]', destaque && 'max-xl:!bg-white/15 max-xl:!text-white')}
          style={{ background: `${cor}2b`, color: cor, boxShadow: `inset 0 0 0 1px ${cor}40` }}
        >
          {icone}
        </span>
        <p className={clsx('min-w-0 flex-1 truncate text-[12.5px] font-medium', destaque ? 'text-white/85 xl:text-txt' : 'text-txt')}>
          {tituloCurto ? <><span className="sm:hidden">{tituloCurto}</span><span className="hidden sm:inline">{titulo}</span></> : titulo}
        </p>
        {acao}
      </div>
      <p className={clsx('font-bold tracking-tight', destaque ? 'text-[25px] text-white xl:text-[21px] xl:text-txt 2xl:text-[23px]' : 'text-[18px] text-txt sm:text-[21px] 2xl:text-[23px]')}>
        {valor}
      </p>
      <p className="mt-2 min-h-[18px]">{rodape}</p>
    </Card>
  );
}

function GraficoVazio({ texto, acao, onAcao }: { texto: string; acao?: string; onAcao?: () => void }) {
  return (
    <div className="flex min-h-[170px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line/80 px-4 py-6 text-center">
      <p className="max-w-[260px] text-[12.5px] leading-relaxed text-txt2">{texto}</p>
      {acao && <button type="button" className="btn-soft py-1.5 text-[12px]" onClick={onAcao}>{acao}</button>}
    </div>
  );
}

function ListaAlertas({ avisos, oculto }: { avisos: Alerta[]; oculto: boolean }) {
  const { ir } = useNav();
  if (avisos.length === 0) {
    return (
      <div className="flex min-h-[170px] flex-col items-center justify-center gap-2 text-center">
        <Bell size={20} className="text-txt3" />
        <p className="max-w-[240px] text-[12.5px] text-txt2">
          Nenhum alerta por enquanto. Contas a vencer, cartões perto do limite, metas e lembretes aparecem aqui.
        </p>
      </div>
    );
  }
  const icone = (t: Alerta['tipo']) =>
    t === 'cartao' ? <CreditCard size={16} /> : t === 'meta' ? <Target size={16} /> : t === 'lembrete' ? <Bell size={16} /> : <Zap size={16} />;
  return (
    <ul className="space-y-1">
      {avisos.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => ir(a.tipo === 'meta' || a.tipo === 'lembrete' ? 'planejamento' : a.tipo === 'cartao' ? 'configuracoes' : 'faturas')}
            className="group flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-card2"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${a.cor}24`, color: a.cor }}>
              {icone(a.tipo)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium text-txt">{a.titulo}</span>
                {a.valor !== undefined && (
                  <span className="shrink-0 text-[11.5px] font-semibold text-txt2">{oculto ? 'R$ ••••' : brl(a.valor)}</span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-txt3">{a.detalhe}</span>
              {a.progresso !== undefined && (
                <span className="mt-1.5 flex items-center gap-2">
                  <Barra pct={a.progresso} cor={a.cor} altura={4} />
                  <span className="text-[10.5px] font-semibold text-txt2">{a.progresso.toFixed(0)}%</span>
                </span>
              )}
            </span>
            <ChevronRight size={14} className="shrink-0 text-txt3 transition-transform group-hover:translate-x-0.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AtalhoLinha({ icone, cor, rotulo, onClick }: { icone: React.ReactNode; cor: string; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-[7px] text-left text-[12.5px] font-medium text-txt transition-all hover:translate-x-0.5 hover:brightness-125"
      style={{ borderColor: `${cor}45`, background: `linear-gradient(90deg, ${cor}26, ${cor}0d)` }}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: `${cor}33`, color: cor }}>{icone}</span>
      <span className="truncate">{rotulo}</span>
    </button>
  );
}

function AtalhoIcone({ icone, cor, rotulo, onClick }: { icone: React.ReactNode; cor: string; rotulo: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5 rounded-xl py-1.5 transition-transform active:scale-95">
      <span className="grid h-12 w-12 place-items-center rounded-2xl transition-transform group-hover:scale-105"
        style={{ background: `${cor}22`, color: cor, boxShadow: `inset 0 0 0 1px ${cor}40` }}>
        {icone}
      </span>
      <span className="text-[11.5px] font-medium text-txt2 group-hover:text-txt">{rotulo}</span>
    </button>
  );
}
