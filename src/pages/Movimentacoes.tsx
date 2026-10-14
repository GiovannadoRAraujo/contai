import { useMemo, useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Bot, Download, Filter, Pencil, Search, Trash2, Upload, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, CabecalhoCard, Card, Confirmacao, Selecao, Vazio } from '@/components/ui';
import { ModalMovimentacao } from '@/components/formularios';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { brl, dataBR, mesDe, rotuloMes } from '@/lib/format';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, corCategoria, normalizar } from '@/lib/categorias';
import type { Movimentacao } from '@/types';

type Ordem = 'data-desc' | 'data-asc' | 'valor-desc' | 'valor-asc';

const ORIGENS = {
  manual: { rotulo: 'Manual', tom: 'neutro' as const, Icone: Pencil },
  importacao: { rotulo: 'Importação', tom: 'ciano' as const, Icone: Upload },
  ia: { rotulo: 'IA', tom: 'roxo' as const, Icone: Bot },
};

export default function Movimentacoes() {
  const { estado, dispatch, avisar } = useApp();
  const { periodo } = useNav();

  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'todos' | 'receita' | 'despesa'>('todos');
  const [categoria, setCategoria] = useState('todas');
  const [conta, setConta] = useState('todas');
  const [escopo, setEscopo] = useState<'mes' | 'tudo'>('mes');
  const [ordem, setOrdem] = useState<Ordem>('data-desc');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [editando, setEditando] = useState<Movimentacao | null>(null);
  const [novoTipo, setNovoTipo] = useState<'receita' | 'despesa'>('despesa');
  const [modal, setModal] = useState(false);
  const [excluir, setExcluir] = useState<Movimentacao | null>(null);

  const categorias = useMemo(
    () => [...new Set([...CATEGORIAS_DESPESA, ...CATEGORIAS_RECEITA, ...estado.categoriasCustom])],
    [estado.categoriasCustom],
  );

  const lista = useMemo(() => {
    const b = normalizar(busca.trim());
    let r = estado.movimentacoes.filter((m) => {
      if (escopo === 'mes' && mesDe(m.data) !== periodo) return false;
      if (tipo !== 'todos' && m.tipo !== tipo) return false;
      if (categoria !== 'todas' && m.categoria !== categoria) return false;
      if (conta !== 'todas' && m.contaId !== conta) return false;
      if (b && !normalizar(`${m.descricao} ${m.categoria} ${m.observacao ?? ''}`).includes(b)) return false;
      return true;
    });
    r = [...r].sort((a, c) => {
      switch (ordem) {
        case 'data-asc': return a.data.localeCompare(c.data);
        case 'valor-desc': return c.valor - a.valor;
        case 'valor-asc': return a.valor - c.valor;
        default: return c.data.localeCompare(a.data);
      }
    });
    return r;
  }, [estado.movimentacoes, busca, tipo, categoria, conta, escopo, periodo, ordem]);

  const totais = useMemo(() => ({
    receitas: lista.filter((m) => m.tipo === 'receita').reduce((t, m) => t + m.valor, 0),
    despesas: lista.filter((m) => m.tipo === 'despesa').reduce((t, m) => t + m.valor, 0),
  }), [lista]);

  const limparFiltros = () => {
    setBusca(''); setTipo('todos'); setCategoria('todas'); setConta('todas'); setEscopo('mes'); setOrdem('data-desc');
  };
  const temFiltro = busca || tipo !== 'todos' || categoria !== 'todas' || conta !== 'todas' || escopo !== 'mes';

  const exportar = () => {
    const linhas = [
      ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta', 'Valor', 'Origem'].join(';'),
      ...lista.map((m) => [
        dataBR(m.data),
        `"${m.descricao.replace(/"/g, "'")}"`,
        m.tipo,
        m.categoria,
        estado.contas.find((c) => c.id === m.contaId)?.nome ?? '',
        m.valor.toFixed(2).replace('.', ','),
        m.origem,
      ].join(';')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${linhas}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `contai-movimentacoes-${escopo === 'mes' ? periodo : 'completo'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar(`${lista.length} movimentação(ões) exportadas em CSV.`);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Resumo + ações */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-verde/15 text-verde"><ArrowUpCircle size={17} /></span>
          <span>
            <span className="block text-[11px] text-txt3">Receitas no filtro</span>
            <span className="block text-[15px] font-bold text-verde">{brl(totais.receitas)}</span>
          </span>
        </Card>
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-rosa/15 text-rosa"><ArrowDownCircle size={17} /></span>
          <span>
            <span className="block text-[11px] text-txt3">Despesas no filtro</span>
            <span className="block text-[15px] font-bold text-rosa">{brl(totais.despesas)}</span>
          </span>
        </Card>
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-roxo/15 text-roxo-luz">=</span>
          <span>
            <span className="block text-[11px] text-txt3">Resultado</span>
            <span className="block text-[15px] font-bold text-txt">{brl(totais.receitas - totais.despesas)}</span>
          </span>
        </Card>

        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-ghost" onClick={exportar} disabled={!lista.length}>
            <Download size={15} /> <span className="hidden sm:inline">Exportar CSV</span>
          </button>
          <button type="button" className="btn-ghost" onClick={() => { setNovoTipo('receita'); setEditando(null); setModal(true); }}>
            <ArrowUpCircle size={15} className="text-verde" /> <span className="hidden sm:inline">Receita</span>
          </button>
          <button type="button" className="btn-primary" onClick={() => { setNovoTipo('despesa'); setEditando(null); setModal(true); }}>
            <ArrowDownCircle size={15} /> Nova despesa
          </button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt3" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição, categoria ou observação"
              aria-label="Buscar movimentações"
              className="field pl-9"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-txt3 hover:text-txt">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-1 rounded-xl border border-line bg-card2 p-1">
            {(['todos', 'receita', 'despesa'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)}
                className={clsx('rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  tipo === t ? 'bg-roxo text-white' : 'text-txt2 hover:text-txt')}>
                {t === 'todos' ? 'Todos' : t === 'receita' ? 'Receitas' : 'Despesas'}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => setFiltrosAbertos((v) => !v)} className={clsx('btn-ghost', filtrosAbertos && 'border-roxo/50 text-txt')}>
            <Filter size={15} /> Filtros
          </button>
        </div>

        {filtrosAbertos && (
          <div className="mt-4 grid animate-fadeUp grid-cols-1 gap-3 border-t border-line/60 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label mb-1.5 block">Período</span>
              <Selecao value={escopo} onChange={(e) => setEscopo(e.target.value as 'mes' | 'tudo')}>
                <option value="mes">{rotuloMes(periodo)}</option>
                <option value="tudo">Todo o histórico</option>
              </Selecao>
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Categoria</span>
              <Selecao value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="todas">Todas</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </Selecao>
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Conta</span>
              <Selecao value={conta} onChange={(e) => setConta(e.target.value)}>
                <option value="todas">Todas</option>
                {estado.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Ordenar por</span>
              <Selecao value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
                <option value="data-desc">Data (mais recente)</option>
                <option value="data-asc">Data (mais antiga)</option>
                <option value="valor-desc">Valor (maior)</option>
                <option value="valor-asc">Valor (menor)</option>
              </Selecao>
            </label>
            {temFiltro && (
              <button type="button" onClick={limparFiltros} className="justify-self-start text-[12.5px] font-medium text-roxo-luz hover:text-txt">
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Lista */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <CabecalhoCard titulo={`${lista.length} movimentação${lista.length === 1 ? '' : 'ões'}`} />
        </div>

        {lista.length === 0 ? (
          <Vazio
            icone={<Search size={22} />}
            titulo="Nenhuma movimentação encontrada"
            descricao={temFiltro
              ? 'Ajuste os filtros ou amplie o período para "Todo o histórico".'
              : 'Cadastre sua primeira receita ou despesa, ou importe uma fatura na tela Faturas.'}
            acao={
              <button type="button" className="btn-primary mt-1" onClick={() => { setNovoTipo('despesa'); setEditando(null); setModal(true); }}>
                Adicionar movimentação
              </button>
            }
          />
        ) : (
          <>
            {/* Tabela no desktop */}
            <div className="hidden lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-y border-line/60 text-[11px] uppercase tracking-wider text-txt3">
                    <th className="px-5 py-2.5 font-medium">Descrição</th>
                    <th className="px-3 py-2.5 font-medium">Data</th>
                    <th className="px-3 py-2.5 font-medium">Categoria</th>
                    <th className="px-3 py-2.5 font-medium">Conta</th>
                    <th className="px-3 py-2.5 font-medium">Origem</th>
                    <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {lista.map((m) => {
                    const O = ORIGENS[m.origem];
                    return (
                      <tr key={m.id} className="group transition-colors hover:bg-card2/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="h-7 w-1 rounded-full" style={{ background: corCategoria(m.categoria) }} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-txt">{m.descricao}</p>
                              {m.parcela && <p className="text-[11px] text-txt3">Parcela {m.parcela.atual}/{m.parcela.total}</p>}
                              {m.observacao && <p className="truncate text-[11px] text-txt3">{m.observacao}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-txt2">{dataBR(m.data)}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-txt2">
                            <span className="h-2 w-2 rounded-full" style={{ background: corCategoria(m.categoria) }} />
                            {m.categoria}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[12.5px] text-txt2">{estado.contas.find((c) => c.id === m.contaId)?.nome ?? '—'}</td>
                        <td className="px-3 py-3"><Badge tom={O.tom}><O.Icone size={11} /> {O.rotulo}</Badge></td>
                        <td className={clsx('whitespace-nowrap px-3 py-3 text-right text-[13px] font-semibold', m.tipo === 'receita' ? 'text-verde' : 'text-rosa')}>
                          {m.tipo === 'receita' ? '+' : '−'} {brl(m.valor)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button type="button" aria-label={`Editar ${m.descricao}`} onClick={() => { setEditando(m); setNovoTipo(m.tipo); setModal(true); }}
                              className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-roxo-luz"><Pencil size={14} /></button>
                            <button type="button" aria-label={`Excluir ${m.descricao}`} onClick={() => setExcluir(m)}
                              className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-rosa"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards no mobile */}
            <ul className="divide-y divide-line/50 lg:hidden">
              {lista.map((m) => {
                const O = ORIGENS[m.origem];
                return (
                  <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: corCategoria(m.categoria) }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-txt">{m.descricao}</p>
                      <p className="mt-0.5 text-[11.5px] text-txt3">
                        {dataBR(m.data)} · {m.categoria} · {estado.contas.find((c) => c.id === m.contaId)?.nome ?? '—'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge tom={O.tom}><O.Icone size={10} /> {O.rotulo}</Badge>
                        <button type="button" onClick={() => { setEditando(m); setNovoTipo(m.tipo); setModal(true); }} className="text-[11.5px] font-medium text-roxo-luz">Editar</button>
                        <button type="button" onClick={() => setExcluir(m)} className="text-[11.5px] font-medium text-rosa">Excluir</button>
                      </div>
                    </div>
                    <span className={clsx('shrink-0 text-[13.5px] font-semibold', m.tipo === 'receita' ? 'text-verde' : 'text-rosa')}>
                      {m.tipo === 'receita' ? '+' : '−'} {brl(m.valor)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <ModalMovimentacao aberto={modal} onFechar={() => { setModal(false); setEditando(null); }} tipo={novoTipo} editando={editando} />

      <Confirmacao
        aberto={!!excluir}
        titulo="Excluir movimentação"
        mensagem={excluir ? `"${excluir.descricao}" (${brl(excluir.valor)}, ${dataBR(excluir.data)}) será removida permanentemente e os indicadores serão recalculados.` : ''}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (excluir) {
            dispatch({ t: 'mov.del', id: excluir.id });
            avisar('Movimentação excluída.', 'info');
          }
          setExcluir(null);
        }}
      />
    </div>
  );
}
