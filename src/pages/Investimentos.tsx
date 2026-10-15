import { useMemo, useState } from 'react';
import { BookOpen, Calculator, LineChart, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { Badge, CabecalhoCard, Card, Confirmacao, Valor, Vazio } from '@/components/ui';
import { LinhaSaldo, Rosca } from '@/components/charts';
import Simulador from '@/components/Simulador';
import { ModalInvestimento } from '@/components/formularios';
import { useApp } from '@/store/app';
import { carteiraPorClasse, patrimonio, serieEstimadaPatrimonio } from '@/lib/finance';
import { brl, dataBR, num } from '@/lib/format';
import { taxasAtuais } from '@/lib/taxas';
import type { Investimento } from '@/types';

type Aba = 'visao' | 'simulador' | 'educacao';

export default function Investimentos() {
  const { estado, dispatch, avisar } = useApp();
  const [aba, setAba] = useState<Aba>('visao');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Investimento | null>(null);
  const [excluir, setExcluir] = useState<Investimento | null>(null);

  const pat = useMemo(() => patrimonio(estado), [estado]);
  const carteira = useMemo(() => carteiraPorClasse(estado), [estado]);
  const evolucao = useMemo(() => serieEstimadaPatrimonio(estado, 6), [estado]);

  // Projeção informativa de 12 meses a 100% do CDI sobre o patrimônio atual (bruta, antes de IR)
  const cdi = taxasAtuais(estado.prefs).CDI;
  const projecao12m = pat.total * (cdi.valor / 100);

  return (
    <div className="space-y-5 pb-8">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {([['visao', 'Visão geral', LineChart], ['simulador', 'Simulador', Calculator], ['educacao', 'Educação financeira', BookOpen]] as const).map(
              ([v, rotulo, Icone]) => (
                <button key={v} type="button" onClick={() => setAba(v)} className={clsx('chip', aba === v && 'chip-on')}>
                  <Icone size={13} /> {rotulo}
                </button>
              ),
            )}
          </div>
          <button type="button" className="btn-primary" onClick={() => { setEditando(null); setModal(true); }}>
            <Plus size={15} /> Novo investimento
          </button>
        </div>
      </Card>

      {aba === 'visao' && (
        <>
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Card className="p-5 lg:col-span-5">
              <p className="text-[12.5px] text-txt2">Seu patrimônio</p>
              <p className="mt-1 text-[28px] font-bold tracking-tight text-txt"><Valor v={pat.total} /></p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px]">
                <TrendingUp size={14} className={pat.rentabilidadeMedia >= 0 ? 'text-verde' : 'text-rosa'} />
                <span className={pat.rentabilidadeMedia >= 0 ? 'font-semibold text-verde' : 'font-semibold text-rosa'}>
                  {num(pat.rentabilidadeMedia, 2)}%
                </span>
                <span className="text-txt3">de rentabilidade acumulada informada ({brl(pat.rendimento)})</span>
              </p>
              <div className="mt-4">
                <LinhaSaldo dados={evolucao} altura={150} chave="saldo" cor="#A855F7" />
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-txt3">
                Série estimada a partir da rentabilidade que você informou em cada ativo. Não há cotação em tempo real
                nem integração com corretoras.
              </p>
            </Card>

            <Card className="p-5 lg:col-span-4">
              <CabecalhoCard titulo="Distribuição da carteira" />
              {carteira.length ? (
                <Rosca dados={carteira} total={pat.total} rotuloCentro="Investido" altura={150} />
              ) : (
                <p className="py-8 text-center text-[13px] text-txt2">Nenhum ativo cadastrado.</p>
              )}
            </Card>

            <Card className="p-5 lg:col-span-3">
              <CabecalhoCard titulo="Projeção bruta em 12 meses" />
              <p className="text-[24px] font-bold tracking-tight text-txt"><Valor v={projecao12m} /></p>
              <p className="mt-1 text-[12px] text-txt2">
                Calculado pelo contAI: <span className="font-semibold text-verde">{num(cdi.valor, 2)}% a.a.</span> (100% do CDI)
                sobre o patrimônio atual, antes de impostos.
              </p>
              <ul className="mt-4 space-y-2">
                {pat.distribuicao.map((d) => (
                  <li key={d.modalidade} className="flex items-center justify-between rounded-lg border border-line/60 bg-card2/50 px-3 py-2 text-[12.5px]">
                    <span className="text-txt2">{d.modalidade}</span>
                    <span className="font-semibold text-txt"><Valor v={d.valor} /></span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10.5px] leading-snug text-txt3">
                CDI: {cdi.fonte}, dado de {dataBR(cdi.data)}{cdi.origem === 'referencia' ? ' — valor ilustrativo, atualize no simulador' : ''}.
                Não garante rentabilidade futura.
              </p>
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="px-5 pt-5">
              <CabecalhoCard titulo="Seus investimentos" />
            </div>
            {estado.investimentos.length === 0 ? (
              <Vazio
                icone={<LineChart size={22} />}
                titulo="Nenhum investimento cadastrado"
                descricao="Cadastre manualmente seus ativos para acompanhar a carteira. O contAI não se conecta a corretoras."
                acao={<button type="button" className="btn-primary mt-1" onClick={() => { setEditando(null); setModal(true); }}>Cadastrar investimento</button>}
              />
            ) : (
              <>
              <ul className="space-y-2 px-4 pb-4 md:hidden">
                {estado.investimentos.map((i) => (
                  <li key={i.id} className="rounded-xl border border-line bg-card2/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-txt">
                          <span className="truncate">{i.nome}</span>{i.demo && <Badge tom="laranja" className="!py-0">Demo</Badge>}
                        </p>
                        <p className="text-[11.5px] text-txt3">{i.modalidade} · atualizado em {dataBR(i.atualizadoEm)}</p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button type="button" aria-label={`Editar ${i.nome}`} onClick={() => { setEditando(i); setModal(true); }}
                          className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-roxo-luz"><Pencil size={14} /></button>
                        <button type="button" aria-label={`Excluir ${i.nome}`} onClick={() => setExcluir(i)}
                          className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-rosa"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <p className="text-[15px] font-bold text-txt"><Valor v={i.valorInvestido} /></p>
                      <p className={clsx('text-[12.5px] font-semibold', i.rentabilidade >= 0 ? 'text-verde' : 'text-rosa')}>
                        {i.rentabilidade >= 0 ? '+' : ''}{num(i.rentabilidade, 2)}% <span className="font-normal text-txt3">informada</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-y border-line/60 text-[11px] uppercase tracking-wider text-txt3">
                      <th className="px-5 py-2.5 font-medium">Ativo</th>
                      <th className="px-3 py-2.5 font-medium">Modalidade</th>
                      <th className="px-3 py-2.5 text-right font-medium">Valor investido</th>
                      <th className="px-3 py-2.5 text-right font-medium">Rentab. informada</th>
                      <th className="px-3 py-2.5 font-medium">Atualizado</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/50">
                    {estado.investimentos.map((i) => (
                      <tr key={i.id} className="group transition-colors hover:bg-card2/50">
                        <td className="px-5 py-3 text-[13px] font-medium text-txt">
                          {i.nome} {i.demo && <Badge tom="laranja" className="ml-1 !py-0">Demo</Badge>}
                        </td>
                        <td className="px-3 py-3 text-[12.5px] text-txt2">{i.modalidade}</td>
                        <td className="px-3 py-3 text-right text-[13px] font-semibold text-txt"><Valor v={i.valorInvestido} /></td>
                        <td className={clsx('px-3 py-3 text-right text-[13px] font-semibold', i.rentabilidade >= 0 ? 'text-verde' : 'text-rosa')}>
                          {i.rentabilidade >= 0 ? '+' : ''}{num(i.rentabilidade, 2)}%
                        </td>
                        <td className="px-3 py-3 text-[12.5px] text-txt2">{dataBR(i.atualizadoEm)}</td>
                        <td className="px-3 py-3">
                          <Badge tom={i.ativo ? 'verde' : 'neutro'}>{i.ativo ? 'Ativo' : 'Encerrado'}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <button type="button" aria-label={`Editar ${i.nome}`} onClick={() => { setEditando(i); setModal(true); }}
                              className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-roxo-luz"><Pencil size={14} /></button>
                            <button type="button" aria-label={`Excluir ${i.nome}`} onClick={() => setExcluir(i)}
                              className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-rosa"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line/60 px-5 py-3 text-[11px] text-txt3">
                <span><strong className="text-txt2">Informado por você:</strong> valor, rentabilidade e data de atualização.</span>
                <span><strong className="text-txt2">Calculado:</strong> totais, distribuição e evolução estimada.</span>
                <span><strong className="text-txt2">Fonte externa:</strong> apenas taxas do Banco Central no simulador, quando atualizadas.</span>
              </p>
              </>
            )}
          </Card>
        </>
      )}

      {aba === 'simulador' && (
        <Card className="p-5">
          <CabecalhoCard titulo="Simulador de investimentos" icone={<Calculator size={16} className="text-roxo-luz" />} />
          <Simulador />
        </Card>
      )}

      {aba === 'educacao' && (
        <Card className="p-5">
          <CabecalhoCard titulo="Educação financeira" icone={<BookOpen size={16} className="text-roxo-luz" />} />
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTEUDO.map((c) => (
              <article key={c.titulo} className="rounded-xl border border-line bg-card2/50 p-4">
                <h4 className="text-[13.5px] font-semibold text-txt">{c.titulo}</h4>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt2">{c.texto}</p>
              </article>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-txt3">
            Conteúdo informativo e educacional. O contAI não presta consultoria nem recomendação de investimentos.
          </p>
        </Card>
      )}

      <ModalInvestimento aberto={modal} onFechar={() => { setModal(false); setEditando(null); }} editando={editando} />

      <Confirmacao
        aberto={!!excluir}
        titulo="Excluir investimento"
        mensagem={excluir ? `"${excluir.nome}" (${brl(excluir.valorInvestido)}) será removido da carteira.` : ''}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (excluir) { dispatch({ t: 'inv.del', id: excluir.id }); avisar('Investimento removido.', 'info'); }
          setExcluir(null);
        }}
      />
    </div>
  );
}

const CONTEUDO = [
  {
    titulo: 'Rendimento bruto x líquido',
    texto: 'O rendimento bruto é o total que a aplicação rendeu. O líquido é o que sobra depois de Imposto de Renda, IOF (em resgates com menos de 30 dias) e taxas. Compare sempre o líquido entre produtos diferentes.',
  },
  {
    titulo: 'Tabela regressiva do IR',
    texto: 'Em renda fixa, a alíquota cai com o tempo: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima disso. Prazos maiores reduzem o imposto sobre o rendimento.',
  },
  {
    titulo: 'CDI, Selic e IPCA+',
    texto: 'O CDI acompanha de perto a Selic e serve de referência para a renda fixa pós-fixada. Produtos IPCA+ pagam a inflação mais uma taxa real, protegendo o poder de compra ao longo do tempo.',
  },
  {
    titulo: 'Reserva antes de investir',
    texto: 'Uma reserva de emergência em aplicação de liquidez diária costuma vir antes de investimentos de prazo mais longo. Em Planejamento você pode criar uma meta específica para ela.',
  },
];
