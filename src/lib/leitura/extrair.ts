/**
 * Extração de texto 100% local (no navegador):
 * - PDF com camada de texto: pdf.js lê o texto diretamente;
 * - PDF escaneado e imagens: OCR com Tesseract (idioma português).
 *
 * Os arquivos não são enviados a nenhum servidor. Observação: na primeira
 * utilização do OCR, o navegador baixa o motor do Tesseract e o modelo de
 * português (alguns MB) da CDN jsDelivr; depois ficam em cache.
 */

export interface Progresso {
  etapa: string;
  pct?: number; // 0..100
}

export interface TextoExtraido {
  texto: string;
  paginas: number;
  metodo: 'pdf-texto' | 'ocr-local';
}

type Avisar = (p: Progresso) => void;

async function carregarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

interface ItemTexto { str: string; transform: number[]; width: number }

/** Reconstrói as linhas visuais de uma página agrupando os trechos pela coordenada Y. */
function montarLinhas(itens: ItemTexto[]): string[] {
  const linhas: Array<{ y: number; partes: Array<{ x: number; fim: number; s: string }> }> = [];
  for (const it of itens) {
    if (!it.str?.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let linha = linhas.find((l) => Math.abs(l.y - y) < 3);
    if (!linha) { linha = { y, partes: [] }; linhas.push(linha); }
    linha.partes.push({ x, fim: x + (it.width || 0), s: it.str });
  }
  return linhas
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const partes = l.partes.sort((a, b) => a.x - b.x);
      let out = '';
      let fimAnterior = -Infinity;
      for (const p of partes) {
        if (out) out += p.x - fimAnterior > 12 ? '   ' : ' ';
        out += p.s.trim();
        fimAnterior = p.fim;
      }
      return out;
    });
}

async function ocr(imagens: Array<Blob | HTMLCanvasElement>, avisar: Avisar, rotulo: (i: number) => string): Promise<string> {
  avisar({ etapa: 'Preparando o leitor de imagens (OCR)…', pct: 2 });
  const { createWorker } = await import('tesseract.js');
  let atual = 0;
  const worker = await createWorker('por', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        const base = (atual / imagens.length) * 100;
        avisar({ etapa: rotulo(atual), pct: Math.round(base + (m.progress * 100) / imagens.length) });
      } else if (/loading|initializ/.test(m.status)) {
        avisar({ etapa: 'Carregando o modelo de português do OCR…', pct: Math.round(m.progress * 10) });
      }
    },
  });
  try {
    const partes: string[] = [];
    for (atual = 0; atual < imagens.length; atual++) {
      const { data } = await worker.recognize(imagens[atual]);
      partes.push(data.text);
    }
    return partes.join('\n');
  } finally {
    await worker.terminate();
  }
}

export async function extrairTextoPdf(arquivo: File, avisar: Avisar): Promise<TextoExtraido> {
  avisar({ etapa: 'Abrindo o PDF…', pct: 5 });
  const pdfjs = await carregarPdfjs();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  } catch (e) {
    const nome = (e as { name?: string }).name;
    if (nome === 'PasswordException') throw new Error('Este PDF está protegido por senha. Remova a proteção no aplicativo do banco ou envie um print das páginas.');
    if (nome === 'InvalidPDFException') throw new Error('O arquivo não é um PDF válido ou está corrompido.');
    throw e;
  }

  const linhas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    avisar({ etapa: `Lendo o texto da página ${i} de ${pdf.numPages}…`, pct: 5 + Math.round((i / pdf.numPages) * 40) });
    const pagina = await pdf.getPage(i);
    const conteudo = await pagina.getTextContent();
    linhas.push(...montarLinhas(conteudo.items as ItemTexto[]));
  }
  const texto = linhas.join('\n');

  // Pouco texto por página = PDF escaneado (imagem). Renderiza e aplica OCR.
  if (texto.replace(/\s/g, '').length < 40 * pdf.numPages) {
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      avisar({ etapa: `PDF escaneado: preparando a página ${i} para OCR…`, pct: 45 });
      const pagina = await pdf.getPage(i);
      const viewport = pagina.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      canvases.push(canvas);
    }
    const lido = await ocr(canvases, avisar, (i) => `Reconhecendo o texto da página ${i + 1} de ${canvases.length}…`);
    return { texto: lido, paginas: pdf.numPages, metodo: 'ocr-local' };
  }

  return { texto, paginas: pdf.numPages, metodo: 'pdf-texto' };
}

export async function extrairTextoImagens(arquivos: File[], avisar: Avisar): Promise<TextoExtraido> {
  const texto = await ocr(arquivos, avisar, (i) =>
    arquivos.length > 1 ? `Reconhecendo o texto da imagem ${i + 1} de ${arquivos.length}…` : 'Reconhecendo o texto da imagem…');
  return { texto, paginas: arquivos.length, metodo: 'ocr-local' };
}

/** Miniatura da 1ª página de um PDF (para pré-visualização). */
export async function miniaturaPdf(arquivo: File, largura = 480): Promise<string> {
  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const pagina = await pdf.getPage(1);
  const base = pagina.getViewport({ scale: 1 });
  const viewport = pagina.getViewport({ scale: largura / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  return canvas.toDataURL('image/png');
}

/** SHA-256 do conteúdo, para reconhecer um arquivo já importado. */
export async function sha256(blobs: Blob[]): Promise<string> {
  const partes = await Promise.all(blobs.map((b) => b.arrayBuffer()));
  const total = partes.reduce((t, p) => t + p.byteLength, 0);
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { junto.set(new Uint8Array(p), pos); pos += p.byteLength; }
  const hash = await crypto.subtle.digest('SHA-256', junto);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Renderiza as primeiras páginas de um PDF como imagens (visualização que funciona também no celular). */
export async function paginasPdf(arquivo: Blob, max = 6, largura = 900): Promise<{ imagens: string[]; total: number }> {
  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const imagens: string[] = [];
  for (let i = 1; i <= Math.min(max, pdf.numPages); i++) {
    const pagina = await pdf.getPage(i);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: largura / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    imagens.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return { imagens, total: pdf.numPages };
}
