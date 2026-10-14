import { useRef, useState } from 'react';
import {
  Camera, ChevronRight, FileText, Image as Img, Loader2, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, CabecalhoCard, Card, Confirmacao, Modal, Vazio } from '@/components/ui';
import RevisaoImportacao from '@/components/RevisaoImportacao';
import { useApp } from '@/store/app';
import { brl, dataBR, diasAte, plural } from '@/lib/format';
import { analisarDocumento, IA_CONFIGURADA, validarArquivo } from '@/lib/documentos';
import type { DocumentoAnalisado, Fatura, StatusFatura } from '@/types';

const STATUS: Record<StatusFatura, { rotulo: string; tom: 'laranja' | 'verde' | 'roxo' }> = {
  pendente: { rotulo: 'Pendente', tom: 'laranja' },
  paga: { rotulo: 'Paga', tom: 'verde' },
  em_analise: { rotulo: 'Em análise', tom: 'roxo' },
};

type Filtro = 'todas' | StatusFatura;

export default function Faturas() {
  const { estado, dispatch, avisar } = useApp();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [upload, setUpload] = useState(false);
  const [doc, setDoc] = useState<DocumentoAnalisado | null>(null);
  const [revisao, setRevisao] = useState(false);
  const [excluir, setExcluir] = useState<Fatura | null>(null);
  const [verArquivo, setVerArquivo] = useState<Fatura | null>(null);

  const contagem = {
    todas: estado.faturas.length,
    pendente: estado.faturas.filter((f) => f.status === 'pendente').length,
    paga: estado.faturas.filter((f) => f.status === 'paga').length,
    em_analise: estado.faturas.filter((f) => f.status === 'em_analise').length,
  };

  const lista = estado.faturas
    .filter((f) => filtro === 'todas' || f.status === filtro)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return (
    <div className="space-y-5 pb-8">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-txt">Suas faturas</h2>
            <p className="mt-0.5 max-w-xl text-[13px] text-txt2">
              Organize, envie e importe suas faturas com o apoio da IA. Fotos, prints de aplicativos bancários,
              PDFs de faturas e extratos são aceitos.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setUpload(true)}>
            <Sparkles size={16} /> Analisar fatura
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['todas', `Todas (${contagem.todas})`],
            ['pendente', `Pendentes (${contagem.pendente})`],
            ['paga', `Pagas (${contagem.paga})`],
            ['em_analise', `Em análise (${contagem.em_analise})`],
          ] as Array<[Filtro, string]>).map(([v, rotulo]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)} className={clsx('chip', filtro === v && 'chip-on')}>
              {rotulo}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <CabecalhoCard titulo={`${lista.length} documento(s)`} />
        {lista.length === 0 ? (
          <Vazio
            icone={<FileText size={22} />}
            titulo="Nenhuma fatura por aqui"
            descricao="Envie uma foto, um print do app do banco ou o PDF da fatura. A IA lê as transações e você revisa antes de importar."
            acao={<button type="button" className="btn-primary mt-1" onClick={() => setUpload(true)}>Enviar documento</button>}
          />
        ) : (
          <ul className="space-y-2.5">
            {lista.map((f) => {
              const d = diasAte(f.vencimento);
              return (
                <li key={f.id}>
                  <div className="group flex items-center gap-3 rounded-xl border border-line/70 bg-card2/50 p-3 transition-all hover:border-roxo/50 hover:bg-card2">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[12px] font-bold uppercase text-white"
                      style={{ background: `linear-gradient(135deg, ${f.cor}, ${f.cor}99)` }}>
                      {f.sigla.slice(0, 4)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-txt">{f.emissor}</p>
                      <p className="text-[11.5px] text-txt3">
                        {f.referencia} · Venc. {dataBR(f.vencimento)}
                        {f.status !== 'paga' && (d < 0
                          ? ` · vencida há ${plural(Math.abs(d), 'dia', 'dias')}`
                          : d === 0 ? ' · vence hoje'
                            : d <= 7 ? ` · em ${plural(d, 'dia', 'dias')}` : '')}
                        {f.importada && ' · importada por IA'}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-[13.5px] font-bold text-txt">{brl(f.valor)}</p>
                      {f.paginas && <p className="text-[11px] text-txt3">{f.paginas} página(s)</p>}
                    </div>
                    <Badge tom={STATUS[f.status].tom}>{STATUS[f.status].rotulo}</Badge>
                    <div className="flex shrink-0 items-center gap-1">
                      {f.status !== 'paga' && (
                        <button type="button"
                          onClick={() => { dispatch({ t: 'fatura.upd', fatura: { ...f, status: 'paga' } }); avisar(`${f.emissor} marcada como paga.`); }}
                          className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-verde hover:bg-verde/10">
                          Marcar paga
                        </button>
                      )}
                      {f.arquivoUrl && (
                        <button type="button" onClick={() => setVerArquivo(f)} aria-label={`Ver arquivo de ${f.emissor}`}
                          className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-roxo-luz"><Img size={15} /></button>
                      )}
                      <button type="button" onClick={() => setExcluir(f)} aria-label={`Excluir fatura ${f.emissor}`}
                        className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-rosa"><Trash2 size={15} /></button>
                      <ChevronRight size={15} className="text-txt3" />
                    </div>
                  </div>
                  <div className="mt-1.5 flex justify-between px-1 text-[12px] font-bold text-txt sm:hidden">
                    <span className="text-txt3">Valor</span>
                    <span>{brl(f.valor)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <PainelUpload
        aberto={upload}
        onFechar={() => setUpload(false)}
        onAnalisado={(d) => { setDoc(d); setUpload(false); setRevisao(true); }}
      />

      <RevisaoImportacao doc={doc} aberto={revisao} onFechar={() => { setRevisao(false); setDoc(null); }} />

      <Modal aberto={!!verArquivo} onFechar={() => setVerArquivo(null)} titulo={verArquivo?.arquivoNome ?? 'Documento'} largura="max-w-2xl">
        {verArquivo?.arquivoUrl && verArquivo.arquivoTipo?.startsWith('image/') ? (
          <img src={verArquivo.arquivoUrl} alt={verArquivo.arquivoNome ?? ''} className="w-full rounded-xl border border-line" />
        ) : (
          <p className="text-[13px] text-txt2">
            Pré-visualização indisponível para este formato.{' '}
            {verArquivo?.arquivoUrl && (
              <a href={verArquivo.arquivoUrl} target="_blank" rel="noreferrer" className="font-medium text-roxo-luz">
                Abrir arquivo em nova aba
              </a>
            )}
          </p>
        )}
      </Modal>

      <Confirmacao
        aberto={!!excluir}
        titulo="Excluir fatura"
        mensagem={excluir ? `A fatura de ${excluir.emissor} (${brl(excluir.valor)}) será removida. As movimentações já importadas continuam nas suas movimentações.` : ''}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (excluir) { dispatch({ t: 'fatura.del', id: excluir.id }); avisar('Fatura excluída.', 'info'); }
          setExcluir(null);
        }}
      />
    </div>
  );
}

/* ------------------------- Painel de upload ------------------------- */
function PainelUpload({
  aberto, onFechar, onAnalisado,
}: { aberto: boolean; onFechar: () => void; onAnalisado: (d: DocumentoAnalisado) => void }) {
  const { estado, avisar } = useApp();
  const [arrastando, setArrastando] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [previas, setPrevias] = useState<Record<string, string>>({});
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const novos: File[] = [];
    const previasNovas: Record<string, string> = {};
    for (const f of Array.from(lista)) {
      const problema = validarArquivo(f);
      if (problema) { setErro(problema); continue; }
      novos.push(f);
      if (f.type.startsWith('image/')) previasNovas[f.name] = URL.createObjectURL(f);
    }
    if (novos.length) {
      setErro(null);
      setArquivos((a) => [...a, ...novos]);
      setPrevias((p) => ({ ...p, ...previasNovas }));
    }
  };

  const analisar = async () => {
    if (!arquivos.length) return;
    setAnalisando(true);
    setErro(null);
    try {
      const doc = await analisarDocumento(arquivos[0], estado);
      if (arquivos.length > 1) {
        avisar(`Analisando "${arquivos[0].name}". Os demais arquivos podem ser enviados em seguida.`, 'info');
      }
      onAnalisado(doc);
      setArquivos((a) => a.slice(1));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível analisar o documento.');
    } finally {
      setAnalisando(false);
    }
  };

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Enviar documento" descricao="Fotos, prints, PDFs de faturas, boletos e extratos — até 12 MB por arquivo." largura="max-w-2xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
        className={clsx(
          'rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          arrastando ? 'border-roxo bg-roxo/10' : 'border-line bg-card2/40',
        )}
      >
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-roxo/15 text-roxo-luz">
          <Upload size={24} />
        </span>
        <p className="text-[14px] font-semibold text-txt">Arraste e solte seus arquivos aqui</p>
        <p className="mt-1 text-[12.5px] text-txt2">PNG, JPG, WEBP ou PDF · documentos com várias páginas são aceitos</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
            Selecionar arquivos
          </button>
          <button type="button" className="btn-ghost" onClick={() => cameraRef.current?.click()}>
            <Camera size={15} /> Usar a câmera
          </button>
        </div>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="sr-only"
          onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only"
          onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
      </div>

      {erro && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-rosa/40 bg-rosa/10 p-3 text-[12.5px] text-rosa">
          <X size={15} className="mt-0.5 shrink-0" /> {erro}
        </p>
      )}

      {arquivos.length > 0 && (
        <ul className="mt-4 space-y-2">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-card2/60 p-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-card">
                {previas[f.name]
                  ? <img src={previas[f.name]} alt="" className="h-full w-full object-cover" />
                  : <FileText size={18} className="text-rosa" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-txt">{f.name}</span>
                <span className="block text-[11.5px] text-txt3">{(f.size / 1024).toFixed(0)} KB · {f.type || 'arquivo'}</span>
              </span>
              <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}
                className="rounded-lg p-1.5 text-txt3 hover:bg-card hover:text-rosa"><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}

      {!IA_CONFIGURADA && (
        <p className="mt-4 rounded-xl border border-laranja/30 bg-laranja/[0.07] p-3 text-[12px] leading-relaxed text-txt2">
          <strong className="text-laranja">Modo demonstração.</strong> Não há serviço de OCR/IA conectado
          (<code className="text-roxo-luz">VITE_IA_ENDPOINT</code> não configurado). A leitura abaixo é gerada localmente
          para exercitar o fluxo completo de extração, classificação, dúvidas e importação — nenhum arquivo sai do seu
          dispositivo.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onFechar} disabled={analisando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={analisar} disabled={!arquivos.length || analisando}>
          {analisando ? <><Loader2 size={15} className="animate-spin" /> Lendo documento…</> : <><Sparkles size={15} /> Analisar com IA</>}
        </button>
      </div>
    </Modal>
  );
}
