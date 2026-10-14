import { useMemo, useState } from 'react';
import { CalendarClock, Check, Pencil, Plus, Repeat, Target, Trash2, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Barra, CabecalhoCard, Campo, Card, Confirmacao, Entrada, Modal, Selecao, Vazio } from '@/components/ui';
import { ModalMeta } from '@/components/formularios';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { noMes, orcamentoVsReal, resumoMes } from '@/lib/finance';
import { brl, dataBR, num, parseBRL, rotuloMes, uid } from '@/lib/format';
import { CATEGORIAS_DESPESA, corCategoria } from '@/lib/categorias';
import type { Meta, Recorrente } from '@/types';

export default function Planejamento() {
  const { estado, dispatch, avisar } = useApp();
  const { periodo } = useNav();

  const [modalMeta, setModalMeta] = useState(false);
  const [metaEditando, setMetaEditando] = useState<Meta | null>(null);
  const [excluirMeta, setExcluirMeta] = useState<Meta | null>(null);
  const [aportando, setAportando] = useState<Meta | null>(null);
  const [valorAporte, setValorAporte] = useState('');
  const [modalOrc, setModalOrc] = useState(false);
  const [modalRec, setModalRec] = useState(false);

  const resumo = useMemo(() => resumoMes(estado, periodo), [estado, periodo]);
  const orcamentos = useMemo(() => orcamentoVsReal(estado, periodo), [estado, periodo]);
  const movsMes = useMemo(() => noMes(estado.movimentacoes, periodo), [estado, periodo]);

  const totalPlanejado = orcamentos.reduce((t, o) => t + o.limite, 0);
  const totalGasto = orcamentos.reduce((t, o) => t + o.gasto, 0);
  const foraDoOrcamento = resumo.despesas - totalGasto;

  const previstas = estado.recorrentes.filter((r) => r.ativo && r.tipo === 'despesa');
  const totalPrevisto = previstas.reduce((t, r) => t + r.valor, 0);
  const jaLancado = (r: Recorrente) =>
    movsMes.some((m) => m.tipo === r.tipo && Math.abs(m.valor - r.valor) < 0.01 && m.categoria === r.categoria);

  return (
    <div className="space-y-5 pb-8">
      {/* Resumo do orçamento */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-5">
          <CabecalhoCard titulo={`Orçamento de ${rotuloMes(periodo)}`} icone={<Wallet size={16} className="text-roxo-luz" />} />
          <div className="flex items-center gap-5">
            <Anel pct={totalPlanejado ? (totalGasto / totalPlanejado) * 100 : 0} />
            <div className="min-w-0">
              <p className="text-[22px] font-bold tracking-tight text-txt">{brl(totalGasto)}</p>
              <p className="text-[12.5px] text-txt2">de {brl(totalPlanejado)} planejados</p>
              <p className={clsx('mt-2 text-[12px] font-semibold', totalPlanejado - totalGasto >= 0 ? 'text-verde' : 'text-rosa')}>
                {totalPlanejado - totalGasto >= 0
                  ? `${brl(totalPlanejado - totalGasto)} disponíveis`
                  : `${brl(Math.abs(totalPlanejado - totalGasto))} acima do planejado`}
              </p>
              {foraDoOrcamento > 0 && (
                <p className="mt-1 text-[11.5px] text-txt3">
                  + {brl(foraDoOrcamento)} em categorias sem orçamento definido.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-line/60 pt-4">
            <p className="text-[12px] font-medium text-txt2">Planejado x realizado</p>
            <div>
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="text-txt3">Planejado</span>
                <span className="text-txt">{brl(totalPlanejado)}</span>
              </div>
              <Barra pct={100} cor="#8B5CF6" altura={7} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="text-txt3">Realizado</span>
                <span className="text-txt">{brl(totalGasto)}</span>
              </div>
              <Barra pct={totalPlanejado ? (totalGasto / totalPlanejado) * 100 : 0} cor={totalGasto > totalPlanejado ? '#F052A0' : '#2DE2A6'} altura={7} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="text-txt3">Despesas totais do mês</span>
                <span className="text-txt">{brl(resumo.despesas)}</span>
              </div>
              <Barra pct={totalPlanejado ? (resumo.despesas / totalPlanejado) * 100 : 0} cor="#FF9F43" altura={7} />
            </div>
            <p className="pt-1 text-[11px] leading-relaxed text-txt3">
              As barras usam o total planejado como referência (100%). “Despesas totais” inclui categorias
              sem limite definido.
            </p>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-7">
          <CabecalhoCard titulo="Limites por categoria" acao="Definir limite" onAcao={() => setModalOrc(true)} />
          {orcamentos.length === 0 ? (
            <Vazio
              icone={<Wallet size={22} />}
              titulo="Nenhum limite definido"
              descricao="Defina quanto pretende gastar em cada categoria e acompanhe o planejado contra o realizado."
              acao={<button type="button" className="btn-primary mt-1" onClick={() => setModalOrc(true)}>Definir limite</button>}
            />
          ) : (
            <ul className="space-y-3.5">
              {orcamentos.map((o) => (
                <li key={o.categoria}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] text-txt">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: corCategoria(o.categoria) }} />
                      {o.categoria}
                    </span>
                    <span className="flex items-center gap-2 text-[12px]">
                      <span className={o.pct > 100 ? 'font-semibold text-rosa' : 'text-txt2'}>
                        {brl(o.gasto)} / {brl(o.limite)}
                      </span>
                      <button type="button" aria-label={`Remover limite de ${o.categoria}`}
                        onClick={() => { dispatch({ t: 'orc.del', categoria: o.categoria }); avisar('Limite removido.', 'info'); }}
                        className="rounded p-1 text-txt3 hover:text-rosa"><Trash2 size={12} /></button>
                    </span>
                  </div>
                  <Barra pct={o.pct} cor={o.pct > 100 ? '#F052A0' : o.pct > 85 ? '#FF9F43' : corCategoria(o.categoria)} />
                  <p className="mt-1 text-[11px] text-txt3">
                    {o.restante >= 0 ? `${brl(o.restante)} restantes` : `${brl(Math.abs(o.restante))} acima do limite`} · {num(o.pct, 0)}% usado
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Metas */}
      <Card className="p-5">
        <CabecalhoCard titulo="Metas de economia" acao="Criar meta" onAcao={() => { setMetaEditando(null); setModalMeta(true); }} icone={<Target size={16} className="text-roxo-luz" />} />
        {estado.metas.length === 0 ? (
          <Vazio
            icone={<Target size={22} />}
            titulo="Nenhuma meta criada"
            descricao="Defina objetivos como uma viagem, a reserva de emergência ou uma compra futura e acompanhe o progresso."
            acao={<button type="button" className="btn-primary mt-1" onClick={() => { setMetaEditando(null); setModalMeta(true); }}>Criar meta</button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {estado.metas.map((m) => {
              const pct = m.alvo ? (m.atual / m.alvo) * 100 : 0;
              const concluida = pct >= 100;
              return (
                <article key={m.id} className={clsx('rounded-xl border p-4 transition-colors', concluida ? 'border-verde/40 bg-verde/[0.06]' : 'border-line bg-card2/50')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-[14px] font-semibold text-txt">{m.nome}</h4>
                      <p className="text-[11.5px] text-txt3">Prazo: {dataBR(m.prazo)}</p>
                    </div>
                    {concluida && <Badge tom="verde"><Check size={10} /> Concluída</Badge>}
                  </div>
                  <p className="mt-3 text-[18px] font-bold text-txt">
                    {brl(m.atual)} <span className="text-[12px] font-medium text-txt3">de {brl(m.alvo)}</span>
                  </p>
                  <div className="mt-2">
                    <Barra pct={pct} cor={concluida ? '#2DE2A6' : m.cor} />
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-txt2">
                    {concluida ? 'Objetivo alcançado.' : `${num(pct, 0)}% concluída · faltam ${brl(m.alvo - m.atual)}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {!concluida && (
                      <button type="button" className="chip" onClick={() => { setAportando(m); setValorAporte(''); }}>
                        <Plus size={12} /> Guardar valor
                      </button>
                    )}
                    <button type="button" className="chip" onClick={() => { setMetaEditando(m); setModalMeta(true); }}>
                      <Pencil size={12} /> Editar
                    </button>
                    <button type="button" className="chip hover:border-rosa/50 hover:text-rosa" onClick={() => setExcluirMeta(m)}>
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recorrentes e despesas previstas */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-7">
          <CabecalhoCard titulo="Contas recorrentes" acao="Adicionar" onAcao={() => setModalRec(true)} icone={<Repeat size={16} className="text-roxo-luz" />} />
          {estado.recorrentes.length === 0 ? (
            <Vazio
              icone={<Repeat size={22} />}
              titulo="Nenhuma conta recorrente"
              descricao="Cadastre aluguel, assinaturas e mensalidades para prever os gastos fixos de cada mês."
              acao={<button type="button" className="btn-primary mt-1" onClick={() => setModalRec(true)}>Adicionar conta</button>}
            />
          ) : (
            <ul className="divide-y divide-line/50">
              {estado.recorrentes.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold"
                    style={{ background: `${corCategoria(r.categoria)}1f`, color: corCategoria(r.categoria) }}>
                    {r.diaVencimento}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-txt">{r.descricao}</span>
                    <span className="block text-[11.5px] text-txt3">
                      {r.categoria} · todo dia {r.diaVencimento} · {r.tipo === 'receita' ? 'entrada' : 'saída'}
                      {jaLancado(r) && ' · já lançada neste mês'}
                    </span>
                  </span>
                  <span className={clsx('text-[13px] font-semibold', r.tipo === 'receita' ? 'text-verde' : 'text-txt')}>
                    {brl(r.valor)}
                  </span>
                  <button type="button" onClick={() => dispatch({ t: 'rec.upd', rec: { ...r, ativo: !r.ativo } })}
                    className={clsx('rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      r.ativo ? 'bg-verde/15 text-verde' : 'bg-card2 text-txt3')}>
                    {r.ativo ? 'Ativa' : 'Pausada'}
                  </button>
                  <button type="button" aria-label={`Excluir ${r.descricao}`}
                    onClick={() => { dispatch({ t: 'rec.del', id: r.id }); avisar('Conta recorrente removida.', 'info'); }}
                    className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-rosa"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-5">
          <CabecalhoCard titulo="Despesas previstas" icone={<CalendarClock size={16} className="text-roxo-luz" />} />
          <p className="text-[24px] font-bold tracking-tight text-txt">{brl(totalPrevisto)}</p>
          <p className="mt-0.5 text-[12.5px] text-txt2">
            Soma das contas recorrentes ativas — {brl(totalPrevisto * 12)} ao longo de 12 meses.
          </p>

          <div className="mt-4 space-y-2">
            <Linha rotulo="Receitas do mês" valor={resumo.receitas} cor="#2DE2A6" />
            <Linha rotulo="Despesas realizadas" valor={resumo.despesas} cor="#F052A0" />
            <Linha rotulo="Gastos fixos previstos" valor={totalPrevisto} cor="#FF9F43" />
            <Linha rotulo="Faturas em aberto" valor={resumo.pendentesValor} cor="#8B5CF6" />
            <div className="border-t border-line/60 pt-2">
              <Linha rotulo="Margem estimada" valor={resumo.receitas - resumo.despesas - resumo.pendentesValor} cor="#A855F7" destaque />
            </div>
          </div>
          <p className="mt-3 text-[10.5px] leading-snug text-txt3">
            A margem considera as receitas do mês menos as despesas já lançadas e as faturas ainda em aberto.
          </p>
        </Card>
      </section>

      {/* Modais */}
      <ModalMeta aberto={modalMeta} onFechar={() => { setModalMeta(false); setMetaEditando(null); }} editando={metaEditando} />

      <Modal aberto={!!aportando} onFechar={() => setAportando(null)} titulo="Guardar valor na meta" largura="max-w-md"
        descricao={aportando ? `${aportando.nome} — faltam ${brl(aportando.alvo - aportando.atual)}` : undefined}>
        <form onSubmit={(e) => {
          e.preventDefault();
          const v = parseBRL(valorAporte);
          if (!aportando || v <= 0) return;
          dispatch({ t: 'meta.upd', meta: { ...aportando, atual: Math.min(aportando.alvo, aportando.atual + v) } });
          avisar(`${brl(v)} guardados em "${aportando.nome}".`);
          setAportando(null);
        }} className="space-y-4">
          <Campo rotulo="Valor a guardar (R$)">
            <Entrada value={valorAporte} onChange={(e) => setValorAporte(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus />
          </Campo>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAportando(null)}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>

      <ModalOrcamento aberto={modalOrc} onFechar={() => setModalOrc(false)} />
      <ModalRecorrente aberto={modalRec} onFechar={() => setModalRec(false)} />

      <Confirmacao
        aberto={!!excluirMeta}
        titulo="Excluir meta"
        mensagem={excluirMeta ? `A meta "${excluirMeta.nome}" será removida.` : ''}
        onCancelar={() => setExcluirMeta(null)}
        onConfirmar={() => {
          if (excluirMeta) { dispatch({ t: 'meta.del', id: excluirMeta.id }); avisar('Meta excluída.', 'info'); }
          setExcluirMeta(null);
        }}
      />
    </div>
  );
}

/* ----------------------------- auxiliares ----------------------------- */
function Linha({ rotulo, valor, cor, destaque = false }: { rotulo: string; valor: number; cor: string; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="flex items-center gap-2 text-txt2">
        <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
        {rotulo}
      </span>
      <span className={clsx('font-semibold', destaque ? 'text-[14px]' : '')} style={{ color: destaque ? cor : '#F5F7FF' }}>
        {brl(valor)}
      </span>
    </div>
  );
}

function Anel({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, pct));
  const raio = 34;
  const circ = 2 * Math.PI * raio;
  const cor = v > 100 ? '#F052A0' : v > 85 ? '#FF9F43' : '#8B5CF6';
  return (
    <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={raio} fill="none" stroke="#182341" strokeWidth="9" />
        <circle
          cx="44" cy="44" r={raio} fill="none" stroke={cor} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (v / 100) * circ}
          style={{ transition: 'stroke-dashoffset .7s ease', filter: `drop-shadow(0 0 6px ${cor}80)` }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[15px] font-bold text-txt">{num(pct, 0)}%</span>
    </div>
  );
}

function ModalOrcamento({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { estado, dispatch, avisar } = useApp();
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_DESPESA[0]);
  const [limite, setLimite] = useState('');
  const [erro, setErro] = useState('');

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Definir limite por categoria" largura="max-w-md"
      descricao="Se a categoria já tiver um limite, ele será substituído.">
      <form onSubmit={(e) => {
        e.preventDefault();
        const v = parseBRL(limite);
        if (v <= 0) { setErro('Informe um limite maior que zero.'); return; }
        dispatch({ t: 'orc.set', orc: { categoria, limite: v } });
        avisar(`Limite de ${categoria} definido em ${brl(v)}.`);
        setLimite(''); setErro('');
        onFechar();
      }} className="space-y-4">
        <Campo rotulo="Categoria">
          <Selecao value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {[...CATEGORIAS_DESPESA, ...estado.categoriasCustom].map((c) => <option key={c} value={c}>{c}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Limite mensal (R$)" erro={erro}>
          <Entrada value={limite} onChange={(e) => setLimite(e.target.value)} inputMode="decimal" placeholder="900,00" autoFocus />
        </Campo>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary">Salvar limite</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRecorrente({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { estado, dispatch, avisar } = useApp();
  const [f, setF] = useState({ descricao: '', valor: '', dia: '5', tipo: 'despesa' as 'despesa' | 'receita', categoria: CATEGORIAS_DESPESA[0] as string });
  const [erros, setErros] = useState<Record<string, string>>({});

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Nova conta recorrente" largura="max-w-md"
      descricao="Usada para prever os gastos fixos do mês. Não gera lançamentos automáticos.">
      <form onSubmit={(e) => {
        e.preventDefault();
        const er: Record<string, string> = {};
        if (!f.descricao.trim()) er.descricao = 'Informe a descrição.';
        const v = parseBRL(f.valor);
        if (v <= 0) er.valor = 'Informe um valor maior que zero.';
        const dia = Number(f.dia);
        if (!dia || dia < 1 || dia > 31) er.dia = 'Informe um dia entre 1 e 31.';
        setErros(er);
        if (Object.keys(er).length) return;

        const rec: Recorrente = {
          id: uid(), descricao: f.descricao.trim(), valor: v, diaVencimento: dia,
          tipo: f.tipo, categoria: f.categoria, ativo: true,
        };
        dispatch({ t: 'rec.add', rec });
        avisar('Conta recorrente adicionada.');
        setF({ descricao: '', valor: '', dia: '5', tipo: 'despesa', categoria: CATEGORIAS_DESPESA[0] });
        onFechar();
      }} className="space-y-4">
        <Campo rotulo="Descrição" erro={erros.descricao}>
          <Entrada value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Academia" autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" erro={erros.valor}>
            <Entrada value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" placeholder="129,90" />
          </Campo>
          <Campo rotulo="Dia do vencimento" erro={erros.dia}>
            <Entrada value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} inputMode="numeric" placeholder="5" />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tipo">
            <Selecao value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as 'despesa' | 'receita' })}>
              <option value="despesa">Saída</option>
              <option value="receita">Entrada</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Categoria">
            <Selecao value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {[...CATEGORIAS_DESPESA, ...estado.categoriasCustom].map((c) => <option key={c} value={c}>{c}</option>)}
            </Selecao>
          </Campo>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary">Adicionar</button>
        </div>
      </form>
    </Modal>
  );
}
