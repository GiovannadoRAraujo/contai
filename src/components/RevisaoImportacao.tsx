import { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CircleHelp, Copy, FileText, Image as Img, Trash2, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, Barra, Campo, Entrada, Modal, Selecao } from './ui';
import { useApp } from '@/store/app';
import { brl, dataBR, parseBRL, uid } from '@/lib/format';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, corCategoria } from '@/lib/categorias';
import { hashMov } from '@/lib/finance';
import type { DocumentoAnalisado, Fatura, Movimentacao, TransacaoExtraida } from '@/types';

const ROTULO_DOC: Record<DocumentoAnalisado['documento'], string> = {
  fatura_cartao: 'Fatura de cartão de crédito',
  conta_consumo: 'Conta de consumo',
  extrato: 'Extrato bancário',
  comprovante: 'Comprovante',
  desconhecido: 'Documento',
};

export default function RevisaoImportacao({
  doc, aberto, onFechar,
}: { doc: DocumentoAnalisado | null; aberto: boolean; onFechar: () => void }) {
  const { estado, dispatch, avisar } = useApp();
  const [trans, setTrans] = useState<TransacaoExtraida[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<string, { texto: string; categoria: string; salvarRegra: boolean }>>({});
  const [criarFatura, setCriarFatura] = useState(true);

  // recarrega o estado local quando um novo documento é aberto
  if (doc && doc.id !== docId) {
    setDocId(doc.id);
    setTrans(doc.transacoes);
    setRespostas(
      Object.fromEntries(
        doc.transacoes
          .filter((t) => t.status === 'duvida')
          .map((t) => [t.id, { texto: '', categoria: t.categoria, salvarRegra: true }]),
      ),
    );
  }

  const duvidas = trans.filter((t) => t.status === 'duvida');
  const importaveis = trans.filter((t) => t.status === 'pendente' || t.status === 'aprovada');
  const duplicadas = trans.filter((t) => t.status === 'duplicada');
  const ignoradas = trans.filter((t) => t.status === 'ignorada');

  const totalImportavel = useMemo(
    () => importaveis.reduce((s, t) => s + (t.tipo === 'despesa' ? t.valor : -t.valor), 0),
    [importaveis],
  );

  if (!doc) return null;

  const atualizar = (id: string, dados: Partial<TransacaoExtraida>) =>
    setTrans((lista) => lista.map((t) => (t.id === id ? { ...t, ...dados } : t)));

  const responderDuvida = (t: TransacaoExtraida) => {
    const r = respostas[t.id];
    if (!r) return;
    if (r.salvarRegra) {
      const padrao = (r.texto.trim() || t.descricao).slice(0, 40);
      dispatch({ t: 'regra.add', padrao: t.descricaoOriginal.split(' ')[0] || padrao, categoria: r.categoria });
    }
    atualizar(t.id, {
      descricao: r.texto.trim() || t.descricao,
      categoria: r.categoria,
      status: 'aprovada',
      confianca: 1,
      motivoDuvida: undefined,
    });
    avisar('Classificação confirmada por você.', 'ok');
  };

  const importar = () => {
    const movs: Movimentacao[] = importaveis.map((t) => ({
      id: uid(),
      tipo: t.tipo,
      descricao: t.descricao,
      valor: t.valor,
      data: t.data,
      categoria: t.categoria,
      contaId: estado.contas[0]?.id ?? '',
      origem: 'ia',
      faturaId: doc.id,
      parcela: t.parcela,
      hash: hashMov(t.data, t.valor, t.descricao),
    }));

    dispatch({ t: 'mov.add', movs });

    if (criarFatura && (doc.documento === 'fatura_cartao' || doc.documento === 'conta_consumo')) {
      const fatura: Fatura = {
        id: doc.id,
        emissor: doc.emissor,
        referencia: ROTULO_DOC[doc.documento],
        valor: doc.totalDocumento ?? movs.reduce((s, m) => s + (m.tipo === 'despesa' ? m.valor : 0), 0),
        vencimento: doc.vencimento ?? new Date().toISOString().slice(0, 10),
        status: 'pendente',
        arquivoNome: doc.arquivoNome,
        arquivoTipo: doc.arquivoTipo,
        arquivoUrl: doc.arquivoUrl,
        paginas: doc.paginas,
        importada: true,
        cor: '#8B5CF6',
        sigla: doc.emissor.slice(0, 2).toLowerCase(),
      };
      dispatch({ t: 'fatura.add', fatura });
    }

    avisar(`${movs.length} transação(ões) importadas para as suas movimentações.`);
    onFechar();
  };

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo="Revisão antes da importação"
      descricao="Confira, edite e aprove os lançamentos. Nada entra nas suas movimentações sem a sua confirmação."
      largura="max-w-5xl"
    >
      {/* Cabeçalho do documento */}
      <div className="mb-5 flex flex-wrap items-start gap-4 rounded-xl border border-line bg-card2/60 p-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-card">
          {doc.arquivoTipo.startsWith('image/') && doc.arquivoUrl ? (
            <img src={doc.arquivoUrl} alt={`Pré-visualização de ${doc.arquivoNome}`} className="h-full w-full object-cover" />
          ) : doc.arquivoTipo.includes('pdf') ? (
            <FileText size={24} className="text-rosa" />
          ) : (
            <Img size={24} className="text-roxo-luz" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-txt">{doc.arquivoNome}</p>
          <p className="mt-0.5 text-[12px] text-txt2">
            {ROTULO_DOC[doc.documento]} · {doc.emissor} · {doc.paginas} página(s)
            {doc.vencimento && ` · vence ${dataBR(doc.vencimento)}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tom="roxo">{trans.length} lançamento(s) lidos</Badge>
            {doc.totalDocumento !== undefined && <Badge tom="neutro">Total do documento: {brl(doc.totalDocumento)}</Badge>}
            {doc.demo && (
              <Badge tom="laranja">
                <Sparkles size={11} /> Extração de demonstração
              </Badge>
            )}
          </div>
          {doc.demo && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-txt3">
              Não há serviço de OCR/IA conectado: os dados abaixo foram gerados localmente para demonstrar o fluxo
              completo de revisão. Configure <code className="text-roxo-luz">VITE_IA_ENDPOINT</code> para usar a leitura real.
            </p>
          )}
        </div>
      </div>

      {/* Dúvidas da IA */}
      {duvidas.length > 0 && (
        <section className="mb-5 space-y-3">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-txt">
            <CircleHelp size={16} className="text-laranja" />
            Preciso da sua ajuda em {duvidas.length} lançamento(s)
          </h3>
          {duvidas.map((t) => {
            const r = respostas[t.id] ?? { texto: '', categoria: t.categoria, salvarRegra: true };
            const categorias = t.tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
            return (
              <div key={t.id} className="rounded-xl border border-laranja/30 bg-laranja/[0.06] p-4">
                <p className="text-[13.5px] leading-relaxed text-txt">
                  Encontrei uma transação de <strong>{brl(t.valor)}</strong> identificada como{' '}
                  <strong>“{t.descricaoOriginal}”</strong> em {dataBR(t.data)}. Você sabe a que ela se refere?
                </p>
                {t.motivoDuvida && <p className="mt-1 text-[11.5px] text-txt3">Motivo: {t.motivoDuvida}</p>}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categorias.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setRespostas((s) => ({ ...s, [t.id]: { ...r, categoria: c } }))}
                      className={clsx('chip', r.categoria === c && 'chip-on')}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: corCategoria(c) }} />
                      {c}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Campo rotulo="Descrição corrigida (opcional)">
                    <Entrada
                      value={r.texto}
                      onChange={(e) => setRespostas((s) => ({ ...s, [t.id]: { ...r, texto: e.target.value } }))}
                      placeholder="Ex.: Mensalidade do serviço de hospedagem"
                    />
                  </Campo>
                  <div className="flex items-end">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => responderDuvida(t)}>
                      <Check size={15} /> Confirmar
                    </button>
                  </div>
                </div>

                <label className="mt-2 flex items-center gap-2 text-[12px] text-txt2">
                  <input
                    type="checkbox"
                    checked={r.salvarRegra}
                    onChange={(e) => setRespostas((s) => ({ ...s, [t.id]: { ...r, salvarRegra: e.target.checked } }))}
                    className="h-4 w-4 rounded border-line bg-card2 accent-[#7C3AED]"
                  />
                  Usar esta classificação como referência para transações semelhantes
                </label>
              </div>
            );
          })}
        </section>
      )}

      {/* Avisos de duplicidade e pagamento de fatura */}
      {(duplicadas.length > 0 || ignoradas.length > 0) && (
        <div className="mb-5 space-y-2">
          {duplicadas.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-ciano/30 bg-ciano/[0.06] p-3 text-[12.5px] text-txt2">
              <Copy size={15} className="mt-0.5 shrink-0 text-ciano" />
              {duplicadas.length} lançamento(s) já existem nas suas movimentações e foram marcados como duplicados — não serão importados.
            </p>
          )}
          {ignoradas.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-roxo/30 bg-roxo/[0.06] p-3 text-[12.5px] text-txt2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-roxo-luz" />
              {ignoradas.length} lançamento(s) correspondem ao pagamento total da fatura. Como as compras individuais já estão
              listadas, importá-los contabilizaria a mesma despesa duas vezes — por isso ficam de fora.
            </p>
          )}
        </div>
      )}

      {/* Tabela editável */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-line bg-card2/60 text-[11px] uppercase tracking-wider text-txt3">
              <th className="px-3 py-2.5 font-medium">Data</th>
              <th className="px-3 py-2.5 font-medium">Descrição</th>
              <th className="px-3 py-2.5 font-medium">Valor</th>
              <th className="px-3 py-2.5 font-medium">Categoria sugerida</th>
              <th className="px-3 py-2.5 font-medium">Confiança</th>
              <th className="px-3 py-2.5 font-medium">Revisão</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {trans.map((t) => {
              const categorias = t.tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
              const inativa = t.status === 'ignorada' || t.status === 'duplicada';
              return (
                <tr key={t.id} className={clsx('align-top transition-colors', inativa ? 'opacity-50' : 'hover:bg-card2/40')}>
                  <td className="px-3 py-2.5">
                    <input type="date" value={t.data} disabled={inativa}
                      onChange={(e) => atualizar(t.id, { data: e.target.value })}
                      className="field px-2 py-1.5 text-[12px]" aria-label="Data" />
                  </td>
                  <td className="px-3 py-2.5">
                    <input value={t.descricao} disabled={inativa}
                      onChange={(e) => atualizar(t.id, { descricao: e.target.value })}
                      className="field w-[200px] px-2 py-1.5 text-[12px]" aria-label="Descrição" />
                    <p className="mt-1 truncate text-[10.5px] text-txt3" title={t.descricaoOriginal}>{t.descricaoOriginal}</p>
                    {t.parcela && <p className="text-[10.5px] text-roxo-luz">Parcela {t.parcela.atual}/{t.parcela.total}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      value={t.valor.toFixed(2).replace('.', ',')}
                      disabled={inativa}
                      onChange={(e) => atualizar(t.id, { valor: parseBRL(e.target.value) })}
                      className={clsx('field w-[94px] px-2 py-1.5 text-[12px] font-semibold', t.tipo === 'receita' ? 'text-verde' : 'text-txt')}
                      aria-label="Valor"
                      inputMode="decimal"
                    />
                    <button type="button" disabled={inativa}
                      onClick={() => atualizar(t.id, { tipo: t.tipo === 'despesa' ? 'receita' : 'despesa' })}
                      className="mt-1 text-[10.5px] font-medium text-roxo-luz hover:text-txt">
                      {t.tipo === 'despesa' ? 'Despesa' : 'Receita'} · trocar
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <Selecao value={t.categoria} disabled={inativa}
                      onChange={(e) => atualizar(t.id, { categoria: e.target.value, status: t.status === 'duvida' ? 'aprovada' : t.status })}
                      className="w-[150px] px-2 py-1.5 text-[12px]">
                      {[...categorias, ...estado.categoriasCustom].map((c) => <option key={c} value={c}>{c}</option>)}
                    </Selecao>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="w-[70px]">
                      <Barra pct={t.confianca * 100} cor={t.confianca >= 0.8 ? '#2DE2A6' : t.confianca >= 0.6 ? '#FF9F43' : '#F052A0'} altura={5} />
                      <span className="mt-1 block text-[10.5px] text-txt3">{Math.round(t.confianca * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {t.status === 'aprovada' && <Badge tom="verde"><Check size={10} /> Aprovada</Badge>}
                    {t.status === 'pendente' && <Badge tom="neutro">A revisar</Badge>}
                    {t.status === 'duvida' && <Badge tom="laranja"><CircleHelp size={10} /> Dúvida</Badge>}
                    {t.status === 'duplicada' && <Badge tom="ciano"><Copy size={10} /> Duplicada</Badge>}
                    {t.status === 'ignorada' && <Badge tom="roxo">Pagamento</Badge>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      {!inativa && t.status !== 'aprovada' && (
                        <button type="button" aria-label="Aprovar" onClick={() => atualizar(t.id, { status: 'aprovada' })}
                          className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-verde"><Check size={14} /></button>
                      )}
                      <button type="button" aria-label="Descartar" onClick={() => setTrans((l) => l.filter((x) => x.id !== t.id))}
                        className="rounded-lg p-1.5 text-txt3 hover:bg-card2 hover:text-rosa"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
        <div className="text-[12.5px] text-txt2">
          <p>
            <strong className="text-txt">{importaveis.length}</strong> de {trans.length} serão importadas ·
            impacto líquido de <strong className="text-txt">{brl(Math.abs(totalImportavel))}</strong> em despesas
          </p>
          {duvidas.length > 0 && (
            <p className="mt-0.5 text-laranja">
              {duvidas.length} lançamento(s) ainda aguardam a sua resposta e não serão importados.
            </p>
          )}
          {(doc.documento === 'fatura_cartao' || doc.documento === 'conta_consumo') && (
            <label className="mt-2 flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={criarFatura} onChange={(e) => setCriarFatura(e.target.checked)}
                className="h-4 w-4 rounded border-line bg-card2 accent-[#7C3AED]" />
              Também registrar este documento na lista de faturas
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-ghost"
            onClick={() => setTrans((l) => l.map((t) => (t.status === 'pendente' ? { ...t, status: 'aprovada' } : t)))}
            disabled={!trans.some((t) => t.status === 'pendente')}>
            <Check size={15} /> Aprovar revisadas
          </button>
          <button type="button" className="btn-primary" onClick={importar} disabled={!importaveis.length}>
            Importar {importaveis.length} transação(ões)
          </button>
        </div>
      </div>
    </Modal>
  );
}
