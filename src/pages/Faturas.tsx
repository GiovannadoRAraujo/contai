import { useEffect, useRef, useState } from 'react';
import {
  Camera, CloudUpload, Eye, FilePlus2, FileText, Image as Img, Loader2, PenLine, Plus, ShieldAlert,
  Sparkles, Trash2, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, CabecalhoCard, Campo, Card, Confirmacao, Entrada, Modal, Selecao, Vazio } from '@/components/ui';
import RevisaoImportacao from '@/components/RevisaoImportacao';
import VisualizadorArquivo from '@/components/VisualizadorArquivo';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { brl, dataBR, diasAte, hoje, parseBRL, plural, uid } from '@/lib/format';
import {
  analisarDocumento, documentoExemplo, documentoManual, IA_CONFIGURADA, tipoReal, validarArquivo,
} from '@/lib/documentos';
import type { Progresso } from '@/lib/leitura/extrair';
import * as db from '@/lib/db';
import type { DocumentoAnalisado, Fatura, StatusFatura } from '@/types';

const STATUS: Record<StatusFatura, { rotulo: string; tom: 'laranja' | 'verde' | 'roxo' }> = {
  pendente: { rotulo: 'Pendente', tom: 'laranja' },
  paga: { rotulo: 'Paga', tom: 'verde' },
  em_analise: { rotulo: 'Em análise', tom: 'roxo' },
};

type Filtro = 'todas' | StatusFatura;

export default function Faturas() {
  const { estado, dispatch, avisar } = useApp();
  const { consumirAcao } = useNav();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [doc, setDoc] = useState<DocumentoAnalisado | null>(null);
  const [excluir, setExcluir] = useState<Fatura | null>(null);
  const [verArquivo, setVerArquivo] = useState<Fatura | null>(null);
  const [nova, setNova] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atalho "Enviar fatura" do dashboard abre direto o seletor de arquivos
  useEffect(() => {
    if (consumirAcao() === 'upload') {
      document.getElementById('area-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => inputRef.current?.click(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contagem = {
    todas: estado.faturas.length,
    pendente: estado.faturas.filter((f) => f.status === 'pendente').length,
    paga: estado.faturas.filter((f) => f.status === 'paga').length,
    em_analise: estado.faturas.filter((f) => f.status === 'em_analise').length,
  };

  const lista = estado.faturas
    .filter((f) => filtro === 'todas' || f.status === filtro)
    .sort((a, b) => (a.status === 'paga' ? 1 : 0) - (b.status === 'paga' ? 1 : 0) || a.vencimento.localeCompare(b.vencimento));

  const excluirFatura = async (f: Fatura) => {
    dispatch({ t: 'fatura.del', id: f.id });
    if (f.documentoId) {
      dispatch({ t: 'doc.del', id: f.documentoId });
      try { await db.apagarArquivo(f.documentoId); } catch { /* arquivo já ausente */ }
    }
    avisar('Fatura e arquivo excluídos. As movimentações já importadas continuam nas suas movimentações.', 'info');
  };

  return (
    <div className="space-y-5 pb-8">
      <Card className="p-5" id="area-upload">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-txt">Enviar documento</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost py-2 text-[12.5px]" onClick={() => setNova(true)}>
              <Plus size={15} /> Conta manual
            </button>
            <button type="button" className="btn-primary py-2 text-[12.5px]" onClick={() => inputRef.current?.click()}>
              <Plus size={15} /> Enviar fatura
            </button>
          </div>
        </div>
        <AreaUpload inputRef={inputRef} onAnalisado={setDoc} />
      </Card>

      <Card className="p-5">
        <CabecalhoCard titulo="Faturas recentes" />
        <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
          {([
            ['todas', `Todas (${contagem.todas})`],
            ['pendente', `Pendentes (${contagem.pendente})`],
            ['em_analise', `Em análise (${contagem.em_analise})`],
            ['paga', `Pagas (${contagem.paga})`],
          ] as Array<[Filtro, string]>).map(([v, rotulo]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)} className={clsx('chip shrink-0', filtro === v && 'chip-on')}>
              {rotulo}
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <Vazio
            icone={<FileText size={22} />}
            titulo={estado.faturas.length ? 'Nada neste filtro' : 'Nenhuma fatura por aqui'}
            descricao="Envie a foto, o print ou o PDF de uma fatura, extrato ou conta. As transações lidas passam pela sua revisão antes de entrar nas movimentações."
            acao={<button type="button" className="btn-primary mt-1" onClick={() => inputRef.current?.click()}>Enviar documento</button>}
          />
        ) : (
          <ul className="space-y-2">
            {lista.map((f) => {
              const d = diasAte(f.vencimento);
              return (
                <li key={f.id} className="group flex items-center gap-3 rounded-xl border border-line/70 bg-card2/50 p-3 transition-all hover:border-roxo/50 hover:bg-card2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold uppercase text-white"
                    style={{ background: `linear-gradient(135deg, ${f.cor}, ${f.cor}99)` }}>
                    {f.sigla.slice(0, 3)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[13.5px] font-semibold text-txt">
                      <span className="truncate">{f.referencia}</span>
                      {f.demo && <Badge tom="laranja" className="!py-0">Demo</Badge>}
                    </p>
                    <p className="truncate text-[11.5px] text-txt3">
                      {f.emissor} · Venc. {dataBR(f.vencimento)}
                      {f.status !== 'paga' && (d < 0
                        ? ` · vencida há ${plural(Math.abs(d), 'dia', 'dias')}`
                        : d === 0 ? ' · vence hoje'
                          : d <= 7 ? ` · em ${plural(d, 'dia', 'dias')}` : '')}
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    {f.importada ? <Badge tom="verde">Importada</Badge> : <Badge tom={STATUS[f.status].tom}>{STATUS[f.status].rotulo}</Badge>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13.5px] font-bold text-txt">{estado.prefs.ocultarValores ? 'R$ ••••' : brl(f.valor)}</p>
                    <p className="text-[10.5px] text-txt3 sm:hidden">{STATUS[f.status].rotulo}</p>
                    {f.paginas ? <p className="hidden text-[10.5px] text-txt3 sm:block">{plural(f.paginas, 'página', 'páginas')}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center">
                    {f.status !== 'paga' && (
                      <button type="button"
                        onClick={() => { dispatch({ t: 'fatura.upd', fatura: { ...f, status: 'paga' } }); avisar(`${f.referencia} marcada como paga.`); }}
                        className="hidden rounded-lg px-2 py-1 text-[11.5px] font-medium text-verde hover:bg-verde/10 sm:block">
                        Marcar paga
                      </button>
                    )}
                    {f.documentoId && (
                      <button type="button" onClick={() => setVerArquivo(f)} aria-label={`Ver arquivo de ${f.referencia}`}
                        className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-roxo-luz"><Eye size={15} /></button>
                    )}
                    <button type="button" onClick={() => setExcluir(f)} aria-label={`Excluir ${f.referencia}`}
                      className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-rosa"><Trash2 size={15} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <RevisaoImportacao doc={doc} aberto={!!doc} onFechar={() => setDoc(null)} />

      <Modal aberto={!!verArquivo} onFechar={() => setVerArquivo(null)} titulo={verArquivo?.arquivoNome ?? 'Documento'} largura="max-w-3xl">
        {verArquivo?.documentoId && (
          <VisualizadorArquivo documentoId={verArquivo.documentoId} tipo={verArquivo.arquivoTipo ?? ''} nome={verArquivo.arquivoNome ?? ''} />
        )}
      </Modal>

      <ModalNovaConta aberto={nova} onFechar={() => setNova(false)} />

      <Confirmacao
        aberto={!!excluir}
        titulo="Excluir fatura"
        mensagem={excluir ? `"${excluir.referencia}" (${brl(excluir.valor)}) e o arquivo guardado serão removidos deste navegador. As movimentações já importadas continuam nas suas movimentações.` : ''}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => { if (excluir) void excluirFatura(excluir); setExcluir(null); }}
      />
    </div>
  );
}

/* ------------------------- Área de upload ------------------------- */
interface ArquivoSelecionado { arquivo: File; previa?: string }

function AreaUpload({
  inputRef, onAnalisado,
}: { inputRef: React.RefObject<HTMLInputElement>; onAnalisado: (d: DocumentoAnalisado) => void }) {
  const { estado, dispatch } = useApp();
  const [arrastando, setArrastando] = useState(false);
  const [arquivos, setArquivos] = useState<ArquivoSelecionado[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [mesmoDocumento, setMesmoDocumento] = useState(true);
  const [ver, setVer] = useState<ArquivoSelecionado | null>(null);
  const [pedirConsentimento, setPedirConsentimento] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => arquivos.forEach((a) => a.previa?.startsWith('blob:') && URL.revokeObjectURL(a.previa)), [arquivos]);

  const adicionar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const problemas: string[] = [];
    const novos: ArquivoSelecionado[] = [];
    for (const f of Array.from(lista)) {
      const problema = await validarArquivo(f);
      if (problema) { problemas.push(problema); continue; }
      if (arquivos.some((a) => a.arquivo.name === f.name && a.arquivo.size === f.size)) continue;
      let previa: string | undefined;
      if (tipoReal(f).startsWith('image/')) previa = URL.createObjectURL(f);
      else {
        try {
          const { miniaturaPdf } = await import('@/lib/leitura/extrair');
          previa = await miniaturaPdf(f, 240);
        } catch (e) {
          problemas.push(`"${f.name}": não foi possível abrir o PDF (${e instanceof Error ? e.message : 'arquivo inválido'}).`);
          continue;
        }
      }
      novos.push({ arquivo: f, previa });
    }
    setErros(problemas);
    if (novos.length) setArquivos((a) => [...a, ...novos]);
  };

  const imagens = arquivos.filter((a) => tipoReal(a.arquivo).startsWith('image/'));
  const lote = (): File[] => {
    const primeiro = arquivos[0];
    if (!primeiro) return [];
    // Várias imagens podem ser páginas do mesmo documento
    if (tipoReal(primeiro.arquivo).startsWith('image/') && mesmoDocumento) return imagens.map((a) => a.arquivo);
    return [primeiro.arquivo];
  };

  const analisar = async (envioExterno: boolean) => {
    const selecionados = lote();
    if (!selecionados.length) return;
    setErros([]);
    setProgresso({ etapa: 'Iniciando…', pct: 0 });
    try {
      const doc = await analisarDocumento(selecionados, estado, { envioExterno, onProgresso: setProgresso });
      setArquivos((a) => a.filter((x) => !selecionados.includes(x.arquivo)));
      onAnalisado(doc);
    } catch (e) {
      setErros([e instanceof Error ? e.message : 'Não foi possível ler o documento.']);
    } finally {
      setProgresso(null);
    }
  };

  const iniciar = () => {
    if (IA_CONFIGURADA && !estado.prefs.consentimentoEnvioExterno) { setPedirConsentimento(true); return; }
    void analisar(IA_CONFIGURADA && estado.prefs.consentimentoEnvioExterno);
  };

  const manual = () => {
    const selecionados = lote();
    setArquivos((a) => a.filter((x) => !selecionados.includes(x.arquivo)));
    onAnalisado(documentoManual(selecionados));
  };

  const ocupado = !!progresso;

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!ocupado) setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!ocupado) void adicionar(e.dataTransfer.files); }}
        className={clsx(
          'rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-colors',
          arrastando ? 'border-roxo bg-roxo/10' : 'border-roxo/35 bg-[#0d1530]',
        )}
      >
        <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl text-roxo-luz">
          <CloudUpload size={30} />
        </span>
        <p className="text-[13.5px] font-medium text-txt">
          <span className="hidden sm:inline">Arraste arquivos aqui ou </span>
          <button type="button" className="font-semibold text-roxo-luz hover:text-txt" onClick={() => inputRef.current?.click()} disabled={ocupado}>
            clique para selecionar
          </button>
        </p>
        <p className="mt-1 text-[12px] text-txt2">Fotos, prints de apps bancários, PDFs de faturas e extratos · várias páginas</p>
        <div className="mt-3 flex justify-center gap-1.5">
          {['JPG', 'PNG', 'WEBP', 'PDF'].map((t) => (
            <span key={t} className="rounded-md border border-line bg-card2 px-2 py-0.5 text-[10.5px] font-semibold text-txt2">{t}</span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary px-6" onClick={() => inputRef.current?.click()} disabled={ocupado}>
            Selecionar arquivos
          </button>
          <button type="button" className="btn-ghost sm:hidden" onClick={() => cameraRef.current?.click()} disabled={ocupado}>
            <Camera size={15} /> Câmera
          </button>
        </div>
        <input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" className="sr-only" aria-label="Selecionar arquivos"
          onChange={(e) => { void adicionar(e.target.files); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Fotografar documento"
          onChange={(e) => { void adicionar(e.target.files); e.target.value = ''; }} />
      </div>

      {erros.length > 0 && (
        <div className="mt-3 space-y-1.5" role="alert">
          {erros.map((e) => (
            <p key={e} className="flex items-start gap-2 rounded-xl border border-rosa/40 bg-rosa/10 p-3 text-[12.5px] text-rosa">
              <X size={15} className="mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}

      {arquivos.length > 0 && (
        <div className="mt-4 space-y-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {arquivos.map((a, i) => (
              <li key={`${a.arquivo.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-card2/60 p-2.5">
                <button type="button" onClick={() => setVer(a)} aria-label={`Pré-visualizar ${a.arquivo.name}`}
                  className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-card">
                  {a.previa ? <img src={a.previa} alt="" className="h-full w-full object-cover" /> : <FileText size={18} className="text-rosa" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-txt">{a.arquivo.name}</span>
                  <span className="block text-[11px] text-txt3">
                    {(a.arquivo.size / 1024).toFixed(0)} KB · {tipoReal(a.arquivo) === 'application/pdf' ? 'PDF' : 'Imagem'}
                    {i === 0 && ' · próximo'}
                  </span>
                </span>
                <button type="button" onClick={() => setVer(a)} className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-roxo-luz" aria-label="Ver">
                  <Img size={15} />
                </button>
                <button type="button" disabled={ocupado} aria-label={`Remover ${a.arquivo.name}`} onClick={() => setArquivos((l) => l.filter((_, j) => j !== i))}
                  className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-rosa"><X size={15} /></button>
              </li>
            ))}
          </ul>

          {imagens.length > 1 && tipoReal(arquivos[0].arquivo).startsWith('image/') && (
            <label className="flex items-center gap-2 text-[12.5px] text-txt2">
              <input type="checkbox" checked={mesmoDocumento} onChange={(e) => setMesmoDocumento(e.target.checked)}
                className="h-4 w-4 accent-[#7C3AED]" />
              As {imagens.length} imagens são páginas do mesmo documento
            </label>
          )}

          <div className="rounded-xl border border-line bg-card2/40 p-3 text-[12px] leading-relaxed text-txt2">
            {IA_CONFIGURADA ? (
              <p><strong className="text-txt">Serviço de IA configurado.</strong> Com a sua autorização, o documento é enviado ao backend definido em
                <code className="mx-1 text-roxo-luz">VITE_IA_ENDPOINT</code>. Sem ela, a leitura acontece localmente.</p>
            ) : (
              <p><strong className="text-txt">Leitura local, sem IA externa.</strong> O texto de PDFs é lido diretamente e imagens passam por OCR no próprio
                navegador; nada é enviado a servidores. Nenhum modelo de linguagem está conectado: a classificação usa regras e as suas
                correções, e o que for ambíguo vira pergunta para você.</p>
            )}
          </div>

          {progresso ? (
            <div className="rounded-xl border border-roxo/40 bg-roxo/[0.08] p-3.5" role="status">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-txt">
                <Loader2 size={15} className="animate-spin text-roxo-luz" /> {progresso.etapa}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card2">
                <div className="h-full rounded-full bg-gradient-to-r from-roxo to-roxo-luz transition-[width] duration-300" style={{ width: `${progresso.pct ?? 5}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={manual}><PenLine size={15} /> Lançar manualmente</button>
              <button type="button" className="btn-primary" onClick={iniciar}>
                <Sparkles size={15} /> Ler documento{arquivos.length > lote().length ? ` (${lote().length} de ${arquivos.length})` : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {arquivos.length === 0 && !progresso && (
        <p className="mt-3 text-center text-[12px] text-txt3">
          Quer conhecer o fluxo sem enviar nada?{' '}
          <button type="button" className="font-semibold text-roxo-luz hover:text-txt" onClick={() => onAnalisado(documentoExemplo(estado))}>
            Abrir uma fatura de exemplo (fictícia)
          </button>
        </p>
      )}

      <Modal aberto={!!ver} onFechar={() => setVer(null)} titulo={ver?.arquivo.name ?? ''} largura="max-w-3xl">
        {ver && <VisualizadorArquivo arquivo={ver.arquivo} tipo={tipoReal(ver.arquivo)} nome={ver.arquivo.name} />}
      </Modal>

      <Modal aberto={pedirConsentimento} onFechar={() => setPedirConsentimento(false)} titulo="Enviar documento ao serviço de IA?" largura="max-w-md">
        <div className="space-y-3 text-[13px] leading-relaxed text-txt2">
          <p className="flex items-start gap-2">
            <ShieldAlert size={17} className="mt-0.5 shrink-0 text-laranja" />
            O documento será enviado ao servidor <code className="break-all text-roxo-luz">{import.meta.env.VITE_IA_ENDPOINT}</code>, que
            o processa com OCR e modelo de linguagem. Ele contém dados financeiros pessoais.
          </p>
          <p>Se preferir, a leitura pode ser feita localmente, sem sair do seu navegador (com menor precisão em fotos).</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => { setPedirConsentimento(false); void analisar(false); }}>Ler localmente</button>
          <button type="button" className="btn-primary" onClick={() => {
            dispatch({ t: 'prefs', dados: { consentimentoEnvioExterno: true } });
            setPedirConsentimento(false);
            void analisar(true);
          }}>Autorizar e enviar</button>
        </div>
      </Modal>
    </>
  );
}

/* ---------------------- Conta a pagar manual ---------------------- */
function ModalNovaConta({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { estado, dispatch, avisar } = useApp();
  const vazio = { referencia: '', emissor: '', valor: '', vencimento: hoje(), contaId: '', status: 'pendente' as StatusFatura };
  const [f, setF] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => { if (aberto) { setF(vazio); setErros({}); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.referencia.trim()) er.referencia = 'Informe a descrição.';
    const valor = parseBRL(f.valor);
    if (!valor || valor <= 0) er.valor = 'Informe um valor maior que zero.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.vencimento)) er.vencimento = 'Informe uma data válida.';
    setErros(er);
    if (Object.keys(er).length) return;
    const emissor = f.emissor.trim() || f.referencia.trim();
    const cartao = estado.contas.find((c) => c.id === f.contaId);
    dispatch({
      t: 'fatura.add',
      fatura: {
        id: uid(), referencia: f.referencia.trim(), emissor, valor, vencimento: f.vencimento, status: f.status,
        contaId: f.contaId || undefined, cor: cartao?.cor ?? '#8B5CF6', sigla: emissor.slice(0, 3).toLowerCase(),
      },
    });
    avisar('Conta registrada. Ela entra em "Contas pendentes" e nos alertas de vencimento.');
    onFechar();
  };

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Registrar conta a pagar" descricao="Para boletos e faturas que você não quer (ou não pode) enviar como arquivo.">
      <form onSubmit={salvar} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Descrição" erro={erros.referencia}>
            <Entrada value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} placeholder="Ex.: Conta de luz" autoFocus />
          </Campo>
          <Campo rotulo="Emissor (opcional)">
            <Entrada value={f.emissor} onChange={(e) => setF({ ...f, emissor: e.target.value })} placeholder="Ex.: Enel" />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" erro={erros.valor}>
            <Entrada value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" placeholder="0,00" />
          </Campo>
          <Campo rotulo="Vencimento" erro={erros.vencimento}>
            <Entrada type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Cartão (se for fatura)">
            <Selecao value={f.contaId} onChange={(e) => setF({ ...f, contaId: e.target.value })}>
              <option value="">Nenhum</option>
              {estado.contas.filter((c) => c.tipo === 'cartao').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Situação">
            <Selecao value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as StatusFatura })}>
              <option value="pendente">Pendente</option>
              <option value="em_analise">Em análise</option>
              <option value="paga">Paga</option>
            </Selecao>
          </Campo>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary"><FilePlus2 size={15} /> Registrar</button>
        </div>
      </form>
    </Modal>
  );
}
