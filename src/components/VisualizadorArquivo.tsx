import { useEffect, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { Carregando } from './ui';
import * as db from '@/lib/db';

/**
 * Pré-visualização de um documento: imagem direta, ou PDF renderizado página a
 * página (funciona também em navegadores móveis que não exibem PDF embutido).
 * Aceita um arquivo em memória ou o id de um arquivo guardado no IndexedDB.
 */
export default function VisualizadorArquivo({
  arquivo, documentoId, tipo, nome,
}: { arquivo?: Blob; documentoId?: string; tipo: string; nome: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<{ imagens: string[]; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let objUrl: string | null = null;
    (async () => {
      try {
        const blob = arquivo ?? (documentoId ? await db.lerArquivo(documentoId) : undefined);
        if (!blob) throw new Error('O arquivo não está mais guardado neste navegador.');
        objUrl = URL.createObjectURL(blob);
        if (!vivo) return;
        setUrl(objUrl);
        if (tipo === 'application/pdf') {
          const { paginasPdf } = await import('@/lib/leitura/extrair');
          const r = await paginasPdf(blob);
          if (vivo) setPaginas(r);
        }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
      }
    })();
    return () => { vivo = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [arquivo, documentoId, tipo]);

  if (erro) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-rosa/40 bg-rosa/10 p-3 text-[12.5px] text-rosa">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {erro}
      </p>
    );
  }
  if (!url || (tipo === 'application/pdf' && !paginas)) return <Carregando linhas={2} altura={220} />;

  return (
    <div className="space-y-3">
      {tipo.startsWith('image/') && <img src={url} alt={`Documento ${nome}`} className="w-full rounded-xl border border-line" />}
      {paginas?.imagens.map((src, i) => (
        <img key={i} src={src} alt={`Página ${i + 1} de ${nome}`} className="w-full rounded-xl border border-line bg-white" />
      ))}
      {paginas && paginas.total > paginas.imagens.length && (
        <p className="text-center text-[12px] text-txt3">Mostrando {paginas.imagens.length} de {paginas.total} páginas.</p>
      )}
      <a href={url} download={nome} className="btn-ghost w-full"><Download size={15} /> Baixar o arquivo original</a>
    </div>
  );
}
