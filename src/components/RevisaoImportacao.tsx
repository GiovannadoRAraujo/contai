import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CheckCheck, CircleHelp, Copy, Eye, EyeOff, FileText, Info, Plus, Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, Barra, Campo, Entrada, Modal, Selecao } from './ui';
import VisualizadorArquivo from './VisualizadorArquivo';
import { useApp } from '@/store/app';
import { brl, dataBR, hoje, parseBRL, plural, uid } from '@/lib/format';
import { corCategoria, nomesCategorias, normalizar } from '@/lib/categorias';
import { hashMov } from '@/lib/finance';
import * as db from '@/lib/db';
import type { DocumentoAnalisado, Fatura, MetodoLeitura, Movimentacao, TransacaoExtraida } from '@/types';

const ROTULO_DOC: Record<DocumentoAnalisado['documento'], string> = {
  fatura_cartao: 'Fatura de cartão de crédito',
  conta_consumo: 'Conta de consumo',
  extrato: 'Extrato bancário',
  comprovante: 'Comprovante',
  desconhecido: 'Documento',
};

const ROTULO_METODO: Record<MetodoLeitura, { texto: string; tom: 'roxo' | 'ciano' | 'laranja' | 'neutro' }> = {
  'pdf-texto': { texto: 'Lido do texto do PDF (local)', tom: 'ciano' },
  'ocr-local': { texto: 'OCR local no navegador', tom: 'ciano' },
  'servico-ia': { texto: 'Serviço de IA externo', tom: 'roxo' },
  'exemplo-demo': { texto: 'Exemplo fictício', tom: 'laranja' },
  manual: { texto: 'Lançamento manual', tom: 'neutro' },
};

interface Resposta { texto: string; categoria: string; salvarRegra: boolean }

/** Padrão usado para aprender uma regra a partir da descrição original. */
const padraoDe = (descricaoOriginal: string) =>
  normalizar(descricaoOriginal)
    .replace(/\s*parc(ela)?\s*\d{1,2}\s*\/\s*\d{1,2}.*$/, '')
    .replace(/\d{3,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 40);

export default function RevisaoImportacao({
  doc, aberto, onFechar,
}: { doc: DocumentoAnalisado | null; aberto: boolean; onFechar: () => void }) {
  const { estado, dispatch, avisar } = useApp();
  const [trans, setTrans] = useState<TransacaoExtraida[]>([]);
  const [sugeridas, setSugeridas] = useState<Record<string, string>>({});
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});
  const [criarFatura, setCriarFatura] = useState(true);
  const [contaId, setContaId] = useState('');
  const [verDoc, setVerDoc] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setTrans(doc.transacoes);
    setSugeridas(Object.fromEntries(doc.transacoes.map((t) => [t.id, t.categoria])));
    setRespostas(Object.fromEntries(
      doc.transacoes.filter((t) => t.status === 'duvida').map((t) => [t.id, { texto: '', categoria: t.categoria, salvarRegra: true }]),
    ));
    setCriarFatura(true);
    setVerDoc(doc.metodo === 'manual');
    // Fatura de cartão: sugere o cartão cujo nome lembra o emissor; senão a primeira conta
    const contas = estado.contas.filter((c) => !c.demo || doc.demo);
    const emissor = normalizar(doc.emissor ?? '');
    const cartao = doc.documento === 'fatura_cartao'
      ? contas.find((c) => c.tipo === 'cartao' && emissor && normalizar(c.nome).includes(emissor.split(' ')[0])) ?? contas.find((c) => c.tipo === 'cartao')
      : undefined;
    setContaId((cartao ?? contas[0])?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const duvidas = trans.filter((t) => t.status === 'duvida');
  const aprovadas = trans.filter((t) => t.status === 'aprovada');
  const pendentes = trans.filter((t) => t.status === 'pendente');
  const duplicadas = trans.filter((t) => t.status === 'duplicada');
  const pagamentos = trans.filter((t) => t.status === 'ignorada' && t.pagamentoFatura);

  const impacto = useMemo(
    () => aprovadas.reduce((s, t) => s + (t.tipo === 'despesa' ? -t.valor : t.valor), 0),
    [aprovadas],
  );

  if (!doc) return null;

  const atualizar = (id: string, dados: Partial<TransacaoExtraida>) =>
    setTrans((lista) => lista.map((t) => (t.id === id ? { ...t, ...dados } : t)));

  const categoriasDe = (t: TransacaoExtraida) => nomesCategorias(estado.categorias, t.tipo);

  const responderDuvida = (t: TransacaoExtraida) => {
    const r = respostas[t.id];
    if (!r) return;
    const padrao = padraoDe(t.descricaoOriginal);
    if (r.salvarRegra && padrao) {
      dispatch({ t: 'regra.add', padrao, categoria: r.categoria, origem: 'revisao' });
    }
    if (r.categoria !== sugeridas[t.id]) {
      dispatch({ t: 'correcao.add', correcao: { descricao: t.descricaoOriginal, de: sugeridas[t.id] ?? '—', para: r.categoria } });
    }
    atualizar(t.id, {
      descricao: r.texto.trim() || t.descricao,
      categoria: r.categoria,
      status: 'aprovada',
      confianca: 1,
      motivoDuvida: undefined,
    });
    avisar(r.salvarRegra && padrao ? `Classificação confirmada e regra salva para "${padrao}".` : 'Classificação confirmada.', 'ok');
  };

  const adicionarLinha = () => {
    setTrans((l) => [...l, {
      id: uid(), data: doc.vencimento ?? hoje(), descricao: '', descricaoOriginal: 'Adicionado manualmente', valor: 0,
      tipo: 'despesa', categoria: 'Outros', confianca: 1, status: 'pendente', natureza: 'compra',
    }]);
  };

  const validas = (lista: TransacaoExtraida[]) => lista.filter((t) => t.descricao.trim() && t.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.data));
  const invalidasAprovadas = aprovadas.length - validas(aprovadas).length;

  const importar = async () => {
    const lista = validas(aprovadas);
    if (!lista.length) return;
    if (!contaId) { avisar('Escolha a conta ou cartão que receberá os lançamentos.', 'erro'); return; }
    setImportando(true);
    try {
      const temArquivo = !!doc.arquivo;
      const faturaId = criarFatura && (doc.documento === 'fatura_cartao' || doc.documento === 'conta_consumo') ? uid() : undefined;
      const documentoId = temArquivo ? doc.id : undefined;

      if (temArquivo && doc.arquivo) await db.salvarArquivo(doc.id, doc.arquivo);

      const movs: Movimentacao[] = lista.map((t) => ({
        id: uid(),
        tipo: t.tipo,
        descricao: t.descricao.trim(),
        valor: Math.round(t.valor * 100) / 100,
        data: t.data,
        categoria: t.categoria,
        contaId,
        origem: doc.metodo === 'servico-ia' ? 'ia' : 'importacao',
        faturaId,
        documentoId,
        parcela: t.parcela,
        hash: hashMov(t.data, t.valor, t.descricao.trim()),
        observacao: t.descricaoOriginal !== t.descricao ? `Original: ${t.descricaoOriginal}` : undefined,
        demo: doc.demo || undefined,
      }));

      // Correções feitas direto na tabela também viram memória de classificação
      lista.filter((t) => sugeridas[t.id] && t.categoria !== sugeridas[t.id] && !respostas[t.id]).forEach((t) =>
        dispatch({ t: 'correcao.add', correcao: { descricao: t.descricaoOriginal, de: sugeridas[t.id], para: t.categoria } }));

      dispatch({ t: 'mov.add', movs });

      if (faturaId) {
        const conta = estado.contas.find((c) => c.id === contaId);
        const valorDespesas = movs.reduce((s, m) => s + (m.tipo === 'despesa' ? m.valor : -m.valor), 0);
        const fatura: Fatura = {
          id: faturaId,
          contaId: conta?.tipo === 'cartao' ? conta.id : undefined,
          emissor: doc.emissor ?? conta?.nome ?? 'Documento importado',
          referencia: doc.documento === 'fatura_cartao' ? `Fatura ${doc.emissor ?? conta?.nome ?? 'do cartão'}` : `${ROTULO_DOC[doc.documento]}${doc.emissor ? ` ${doc.emissor}` : ''}`,
          valor: doc.totalDocumento ?? Math.round(valorDespesas * 100) / 100,
          vencimento: doc.vencimento ?? hoje(),
          status: 'pendente',
          documentoId,
          arquivoNome: doc.arquivoNome,
          arquivoTipo: doc.arquivoTipo,
          paginas: doc.paginas,
          linhaDigitavel: doc.linhaDigitavel,
          importada: true,
          cor: conta?.cor ?? '#8B5CF6',
          sigla: (doc.emissor ?? conta?.nome ?? 'doc').slice(0, 3).toLowerCase(),
          demo: doc.demo || undefined,
        };
        dispatch({ t: 'fatura.add', fatura });
      }

      if (temArquivo && doc.arquivo) {
        dispatch({
          t: 'doc.add',
          doc: {
            id: doc.id, nome: doc.arquivoNome, tipo: doc.arquivoTipo, tamanho: doc.arquivo.size, sha256: doc.sha256 ?? '',
            paginas: doc.paginas, faturaId, importadoEm: new Date().toISOString(), transacoesImportadas: movs.length,
          },
        });
      }

      avisar(`${plural(movs.length, 'transação importada', 'transações importadas')} para as suas movimentações.`);
      onFechar();
    } catch (e) {
      avisar(`Não foi possível importar: ${e instanceof Error ? e.message : 'erro ao gravar no navegador'}.`, 'erro');
    } finally {
      setImportando(false);
    }
  };

  const metodo = ROTULO_METODO[doc.metodo];
  const contasDisponiveis = estado.contas.filter((c) => !c.demo || doc.demo);

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo="Revisão antes da importação"
      descricao="Confira, corrija e aprove os lançamentos. Nada entra nas suas movimentações sem a sua confirmação."
      largura="max-w-6xl"
    >
      {/* Cabeçalho do documento */}
      <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-line bg-card2/60 p-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-card">
          {doc.arquivoTipo.startsWith('image/') && doc.arquivoUrl
            ? <img src={doc.arquivoUrl} alt="" className="h-full w-full object-cover" />
            : <FileText size={22} className="text-roxo-luz" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-txt">{doc.arquivoNome}</p>
          <p className="mt-0.5 text-[12px] text-txt2">
            {ROTULO_DOC[doc.documento]}{doc.emissor ? ` · ${doc.emissor}` : ''} · {plural(doc.paginas, 'página', 'páginas')}
            {doc.vencimento && ` · vence ${dataBR(doc.vencimento)}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tom={metodo.tom}>{metodo.texto}</Badge>
            <Badge tom="neutro">{plural(trans.length, 'lançamento', 'lançamentos')}</Badge>
            {doc.totalDocumento !== undefined && <Badge tom="neutro">Total do documento: {brl(doc.totalDocumento)}</Badge>}
            {doc.linhaDigitavel && <Badge tom="neutro">Linha digitável encontrada</Badge>}
          </div>
        </div>
        {(doc.arquivo || doc.textoExtraido) && (
          <button type="button" className="btn-ghost py-2 text-[12.5px]" onClick={() => setVerDoc((v) => !v)}>
            {verDoc ? <EyeOff size={15} /> : <Eye size={15} />} {verDoc ? 'Ocultar documento' : 'Ver documento'}
          </button>
        )}
      </div>

      {doc.jaImportadoEm && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-laranja/40 bg-laranja/10 p-3 text-[12.5px] text-txt">
          <Copy size={15} className="mt-0.5 shrink-0 text-laranja" />
          Este mesmo arquivo já foi importado em {dataBR(doc.jaImportadoEm)}. Lançamentos repetidos aparecem como duplicados e não serão importados.
        </p>
      )}

      {doc.avisos.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {doc.avisos.map((a) => (
            <li key={a} className="flex items-start gap-2 rounded-xl border border-line bg-card2/40 px-3 py-2 text-[12px] leading-relaxed text-txt2">
              <Info size={14} className="mt-0.5 shrink-0 text-roxo-luz" /> {a}
            </li>
          ))}
        </ul>
      )}

      <div className={clsx('grid gap-4', verDoc && 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]')}>
        {verDoc && (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-card2/30 p-2 lg:sticky lg:top-0">
            {doc.arquivo
              ? <VisualizadorArquivo arquivo={doc.arquivo} tipo={doc.arquivoTipo} nome={doc.arquivoNome} />
              : <pre className="whitespace-pre-wrap p-2 font-mono text-[11.5px] leading-relaxed text-txt2">{doc.textoExtraido}</pre>}
          </div>
        )}

        <div className="min-w-0">
          {/* Dúvidas da IA */}
          {duvidas.length > 0 && (
            <section className="mb-5 space-y-3" aria-label="Dúvidas">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-txt">
                <CircleHelp size={16} className="text-laranja" />
                Preciso da sua ajuda em {plural(duvidas.length, 'lançamento', 'lançamentos')}
              </h3>
              {duvidas.map((t) => {
                const r = respostas[t.id] ?? { texto: '', categoria: t.categoria, salvarRegra: true };
                const set = (d: Partial<Resposta>) => setRespostas((s) => ({ ...s, [t.id]: { ...r, ...d } }));
                return (
                  <div key={t.id} className="rounded-xl border border-laranja/30 bg-laranja/[0.06] p-4">
                    <p className="text-[13.5px] leading-relaxed text-txt">
                      Encontrei {t.tipo === 'receita' ? 'uma entrada' : 'uma transação'} de <strong>{brl(t.valor)}</strong> identificada como{' '}
                      <strong>“{t.descricaoOriginal}”</strong> em {dataBR(t.data)}. Você sabe a que ela se refere?
                    </p>
                    {t.motivoDuvida && <p className="mt-1 text-[11.5px] text-txt3">Por que pergunto: {t.motivoDuvida}</p>}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {categoriasDe(t).map((c) => (
                        <button key={c} type="button" onClick={() => set({ categoria: c })} className={clsx('chip', r.categoria === c && 'chip-on')}>
                          <span className="h-2 w-2 rounded-full" style={{ background: corCategoria(c) }} />
                          {c}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <Campo rotulo="Do que se trata? (resposta livre, vira a descrição)">
                        <Entrada value={r.texto} onChange={(e) => set({ texto: e.target.value })} placeholder="Ex.: Assinatura do serviço de hospedagem do site" />
                      </Campo>
                      <div className="flex items-end gap-2">
                        <button type="button" className="btn-ghost" onClick={() => atualizar(t.id, { status: 'ignorada', motivoDuvida: 'Descartado por você na revisão.' })}>
                          Não importar
                        </button>
                        <button type="button" className="btn-primary" onClick={() => responderDuvida(t)}>
                          <Check size={15} /> Confirmar
                        </button>
                      </div>
                    </div>

                    <label className="mt-2.5 flex items-start gap-2 text-[12px] text-txt2">
                      <input type="checkbox" checked={r.salvarRegra} onChange={(e) => set({ salvarRegra: e.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-[#7C3AED]" />
                      <span>
                        Usar esta classificação como referência para transações semelhantes
                        {padraoDe(t.descricaoOriginal) && <span className="text-txt3"> (descrições com “{padraoDe(t.descricaoOriginal)}”)</span>}
                      </span>
                    </label>
                  </div>
                );
              })}
            </section>
          )}

          {(duplicadas.length > 0 || pagamentos.length > 0) && (
            <div className="mb-4 space-y-2">
              {duplicadas.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-ciano/30 bg-ciano/[0.06] p-3 text-[12.5px] text-txt2">
                  <Copy size={15} className="mt-0.5 shrink-0 text-ciano" />
                  {plural(duplicadas.length, 'lançamento já existe', 'lançamentos já existem')} nas suas movimentações e não {duplicadas.length === 1 ? 'será importado' : 'serão importados'}.
                </p>
              )}
              {pagamentos.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-roxo/30 bg-roxo/[0.06] p-3 text-[12.5px] text-txt2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-roxo-luz" />
                  {plural(pagamentos.length, 'lançamento corresponde', 'lançamentos correspondem')} ao pagamento da fatura. As compras já estão listadas
                  individualmente; importar o pagamento contaria a mesma despesa duas vezes.
                </p>
              )}
            </div>
          )}

          {/* Tabela editável (desktop) */}
          <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line bg-card2/60 text-[11px] uppercase tracking-wider text-txt3">
                  <th className="px-2.5 py-2.5 font-medium">Data</th>
                  <th className="px-2.5 py-2.5 font-medium">Descrição</th>
                  <th className="px-2.5 py-2.5 font-medium">Valor</th>
                  <th className="px-2.5 py-2.5 font-medium">Categoria sugerida</th>
                  <th className="px-2.5 py-2.5 font-medium">Confiança</th>
                  <th className="px-2.5 py-2.5 font-medium">Revisão</th>
                  <th className="px-2.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {trans.map((t) => (
                  <LinhaTabela key={t.id} t={t} categorias={categoriasDe(t)} atualizar={atualizar}
                    remover={() => setTrans((l) => l.filter((x) => x.id !== t.id))} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Lista de cards (mobile) */}
          <ul className="space-y-2 md:hidden">
            {trans.map((t) => (
              <CardTransacao key={t.id} t={t} categorias={categoriasDe(t)} atualizar={atualizar}
                remover={() => setTrans((l) => l.filter((x) => x.id !== t.id))} />
            ))}
          </ul>

          <button type="button" className="btn-soft mt-3 py-2 text-[12.5px]" onClick={adicionarLinha}>
            <Plus size={15} /> Adicionar lançamento manualmente
          </button>
        </div>
      </div>

      {/* Rodapé */}
      <div className="mt-5 space-y-3 border-t border-line/60 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Importar para a conta / cartão" className="min-w-[220px] flex-1 sm:flex-none">
            <Selecao value={contaId} onChange={(e) => setContaId(e.target.value)}>
              {contasDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.tipo === 'cartao' ? ' (cartão)' : ''}</option>)}
            </Selecao>
          </Campo>
          {(doc.documento === 'fatura_cartao' || doc.documento === 'conta_consumo') && (
            <label className="mb-2.5 flex items-center gap-2 text-[12.5px] text-txt2">
              <input type="checkbox" checked={criarFatura} onChange={(e) => setCriarFatura(e.target.checked)} className="h-4 w-4 accent-[#7C3AED]" />
              Registrar também na lista de faturas (conta a pagar)
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] text-txt2">
            <p>
              <strong className="text-txt">{aprovadas.length}</strong> aprovada(s) de {trans.length} · impacto no saldo:{' '}
              <strong className={impacto < 0 ? 'text-rosa' : 'text-verde'}>{impacto < 0 ? '−' : '+'} {brl(Math.abs(impacto))}</strong>
            </p>
            {pendentes.length > 0 && <p className="text-txt3">{plural(pendentes.length, 'item aguarda', 'itens aguardam')} aprovação.</p>}
            {duvidas.length > 0 && <p className="text-laranja">{plural(duvidas.length, 'dúvida precisa', 'dúvidas precisam')} da sua resposta antes de importar.</p>}
            {invalidasAprovadas > 0 && <p className="text-rosa">{invalidasAprovadas} aprovada(s) sem descrição, valor ou data válidos serão ignoradas.</p>}
            {doc.demo && <p className="text-laranja">Lançamentos do exemplo entram marcados como “Demo” e saem junto com os dados de demonstração.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn-ghost" disabled={!pendentes.length}
              onClick={() => setTrans((l) => l.map((t) => (t.status === 'pendente' ? { ...t, status: 'aprovada' } : t)))}>
              <CheckCheck size={15} /> Aprovar todos os revisados
            </button>
            <button type="button" className="btn-primary" onClick={() => void importar()} disabled={!validas(aprovadas).length || importando}>
              {importando ? 'Importando…' : `Importar ${validas(aprovadas).length} aprovada(s)`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Linhas ------------------------------ */
type PropsLinha = {
  t: TransacaoExtraida;
  categorias: string[];
  atualizar: (id: string, d: Partial<TransacaoExtraida>) => void;
  remover: () => void;
};

function StatusRevisao({ t }: { t: TransacaoExtraida }) {
  if (t.status === 'aprovada') return <Badge tom="verde"><Check size={10} /> Aprovada</Badge>;
  if (t.status === 'pendente') return <Badge tom="neutro">A revisar</Badge>;
  if (t.status === 'duvida') return <Badge tom="laranja"><CircleHelp size={10} /> Dúvida</Badge>;
  if (t.status === 'duplicada') return <Badge tom="ciano"><Copy size={10} /> Duplicada</Badge>;
  return <Badge tom="roxo">{t.pagamentoFatura ? 'Pagamento' : 'Descartada'}</Badge>;
}

function Confianca({ v }: { v: number }) {
  return (
    <div className="w-[64px]">
      <Barra pct={v * 100} cor={v >= 0.8 ? '#2DE2A6' : v >= 0.6 ? '#FF9F43' : '#F052A0'} altura={5} />
      <span className="mt-1 block text-[10.5px] text-txt3">{Math.round(v * 100)}%</span>
    </div>
  );
}

function CampoValor({ t, atualizar, className }: { t: TransacaoExtraida; atualizar: PropsLinha['atualizar']; className?: string }) {
  const [texto, setTexto] = useState(t.valor ? t.valor.toFixed(2).replace('.', ',') : '');
  useEffect(() => { setTexto(t.valor ? t.valor.toFixed(2).replace('.', ',') : ''); }, [t.valor]);
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => atualizar(t.id, { valor: Math.abs(parseBRL(texto)) })}
      disabled={t.status === 'ignorada' || t.status === 'duplicada'}
      className={clsx('field px-2 py-1.5 text-[12px] font-semibold', t.tipo === 'receita' ? 'text-verde' : 'text-txt', !t.valor && 'border-rosa/60', className)}
      aria-label="Valor"
      inputMode="decimal"
      placeholder="0,00"
    />
  );
}

function Acoes({ t, atualizar, remover }: Omit<PropsLinha, 'categorias'>) {
  const inativa = t.status === 'ignorada' || t.status === 'duplicada';
  return (
    <div className="flex gap-1">
      {inativa ? (
        <button type="button" onClick={() => atualizar(t.id, { status: 'pendente', pagamentoFatura: false })}
          className="rounded-lg px-2 py-1 text-[11px] font-medium text-roxo-luz hover:bg-card2" title="Incluir mesmo assim">
          Incluir
        </button>
      ) : t.status !== 'aprovada' && t.status !== 'duvida' ? (
        <button type="button" aria-label="Aprovar" title="Aprovar" onClick={() => atualizar(t.id, { status: 'aprovada' })}
          className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-verde"><Check size={15} /></button>
      ) : t.status === 'aprovada' ? (
        <button type="button" aria-label="Desfazer aprovação" title="Desfazer aprovação" onClick={() => atualizar(t.id, { status: 'pendente' })}
          className="rounded-lg p-1.5 text-verde hover:bg-card2"><Check size={15} /></button>
      ) : null}
      <button type="button" aria-label="Descartar" title="Descartar" onClick={remover}
        className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-rosa"><Trash2 size={14} /></button>
    </div>
  );
}

function LinhaTabela({ t, categorias, atualizar, remover }: PropsLinha) {
  const inativa = t.status === 'ignorada' || t.status === 'duplicada';
  return (
    <tr className={clsx('align-top transition-colors', inativa ? 'opacity-55' : t.status === 'duvida' ? 'bg-laranja/[0.04]' : 'hover:bg-card2/40')}>
      <td className="px-2.5 py-2.5">
        <input type="date" value={t.data} disabled={inativa} onChange={(e) => atualizar(t.id, { data: e.target.value })}
          className="field w-[138px] px-2 py-1.5 text-[12px]" aria-label="Data" />
      </td>
      <td className="px-2.5 py-2.5">
        <input value={t.descricao} disabled={inativa} onChange={(e) => atualizar(t.id, { descricao: e.target.value })}
          className={clsx('field w-[210px] px-2 py-1.5 text-[12px]', !t.descricao.trim() && 'border-rosa/60')} aria-label="Descrição" placeholder="Descrição" />
        <p className="mt-1 max-w-[210px] truncate text-[10.5px] text-txt3" title={t.linhaOrigem ?? t.descricaoOriginal}>{t.descricaoOriginal}</p>
        {t.parcela && <p className="text-[10.5px] text-roxo-luz">Parcela {t.parcela.atual}/{t.parcela.total}</p>}
      </td>
      <td className="px-2.5 py-2.5">
        <CampoValor t={t} atualizar={atualizar} className="w-[96px]" />
        <button type="button" disabled={inativa}
          onClick={() => atualizar(t.id, { tipo: t.tipo === 'despesa' ? 'receita' : 'despesa', categoria: 'Outros' })}
          className="mt-1 block text-[10.5px] font-medium text-roxo-luz hover:text-txt">
          {t.tipo === 'despesa' ? 'Despesa' : 'Receita'} · trocar
        </button>
      </td>
      <td className="px-2.5 py-2.5">
        <Selecao value={t.categoria} disabled={inativa}
          onChange={(e) => atualizar(t.id, { categoria: e.target.value, confianca: 1, status: t.status === 'duvida' ? 'aprovada' : t.status, motivoDuvida: undefined })}
          className="w-[150px] px-2 py-1.5 text-[12px]" aria-label="Categoria">
          {[...new Set([...categorias, t.categoria])].map((c) => <option key={c} value={c}>{c}</option>)}
        </Selecao>
      </td>
      <td className="px-2.5 py-2.5"><Confianca v={t.confianca} /></td>
      <td className="px-2.5 py-2.5"><StatusRevisao t={t} /></td>
      <td className="px-2.5 py-2.5"><Acoes t={t} atualizar={atualizar} remover={remover} /></td>
    </tr>
  );
}

function CardTransacao({ t, categorias, atualizar, remover }: PropsLinha) {
  const inativa = t.status === 'ignorada' || t.status === 'duplicada';
  return (
    <li className={clsx('rounded-xl border p-3', inativa ? 'border-line/60 opacity-60' : t.status === 'duvida' ? 'border-laranja/40 bg-laranja/[0.05]' : 'border-line bg-card2/40')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <StatusRevisao t={t} />
        <div className="flex items-center gap-2">
          <Confianca v={t.confianca} />
          <Acoes t={t} atualizar={atualizar} remover={remover} />
        </div>
      </div>
      <input value={t.descricao} disabled={inativa} onChange={(e) => atualizar(t.id, { descricao: e.target.value })}
        className="field px-2.5 py-2 text-[13px]" aria-label="Descrição" placeholder="Descrição" />
      <p className="mt-1 truncate text-[10.5px] text-txt3">{t.descricaoOriginal}{t.parcela ? ` · parcela ${t.parcela.atual}/${t.parcela.total}` : ''}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input type="date" value={t.data} disabled={inativa} onChange={(e) => atualizar(t.id, { data: e.target.value })}
          className="field px-2 py-2 text-[12.5px]" aria-label="Data" />
        <CampoValor t={t} atualizar={atualizar} />
        <Selecao value={t.categoria} disabled={inativa}
          onChange={(e) => atualizar(t.id, { categoria: e.target.value, confianca: 1, status: t.status === 'duvida' ? 'aprovada' : t.status })}
          className="col-span-2 px-2 py-2 text-[12.5px]" aria-label="Categoria">
          {[...new Set([...categorias, t.categoria])].map((c) => <option key={c} value={c}>{c}</option>)}
        </Selecao>
      </div>
      <button type="button" disabled={inativa} onClick={() => atualizar(t.id, { tipo: t.tipo === 'despesa' ? 'receita' : 'despesa', categoria: 'Outros' })}
        className="mt-1.5 text-[11px] font-medium text-roxo-luz">
        {t.tipo === 'despesa' ? 'Despesa' : 'Receita'} · trocar
      </button>
    </li>
  );
}
