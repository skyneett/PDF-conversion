import { PyMuPDF, type PyMuPDFDocument } from '@bentopdf/pymupdf-wasm';
import { MIN_TEXT_CHARS } from '../lib/constants';
import type {
  AppErrorPayload,
  WordPageSize,
  WorkerConvertRequest,
  WorkerConvertWordPage,
  WorkerConvertWordRequest,
  WorkerMessage,
  WorkerRequest
} from '../types';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

class ConvertFailure extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ConvertFailure';
  }
}

let enginePromise: Promise<PyMuPDF> | null = null;
let engineLoaded = false;

function post(message: WorkerMessage): void {
  workerScope.postMessage(message);
}

function getEngine(assetPath: string): Promise<PyMuPDF> {
  if (!enginePromise) {
    const engine = new PyMuPDF({ assetPath });
    enginePromise = engine
      .load()
      .then(() => {
        engineLoaded = true;
        return engine;
      })
      .catch((error: unknown) => {
        enginePromise = null;
        throw new ConvertFailure(
          'ENGINE_LOAD',
          error instanceof Error ? error.message : 'No se pudo cargar el motor'
        );
      });
  }

  return enginePromise;
}

function normalizeFailure(error: unknown, mode: 'pdf' | 'word' = 'pdf'): AppErrorPayload {
  if (error instanceof ConvertFailure) {
    return { code: error.code, message: error.message };
  }

  const raw = error instanceof Error ? error.message : String(error);

  if (mode === 'word') {
    if (/page|pages|páginas/i.test(raw)) {
      return {
        code: 'DOCX_TOO_MANY_PAGES',
        message: 'El Word tiene más páginas de las permitidas.'
      };
    }

    return {
      code: 'DOCX_CORRUPT',
      message: 'No se pudo leer el Word. Prueba con otro archivo .docx.'
    };
  }

  if (/password|encrypt|authenticate/i.test(raw)) {
    return {
      code: 'PDF_PASSWORD',
      message: 'El PDF está protegido con contraseña.'
    };
  }

  if (/scanned|no text|words count:\s*0/i.test(raw)) {
    return {
      code: 'PDF_SCANNED',
      message: 'El PDF parece escaneado y no tiene texto seleccionable.'
    };
  }

  if (/cannot find object|xref|corrupt|damaged|syntax|invalid/i.test(raw)) {
    return {
      code: 'PDF_CORRUPT',
      message: 'El PDF está dañado o no se puede leer.'
    };
  }

  return {
    code: 'INTERNAL',
    message: 'No se pudo convertir el PDF.'
  };
}

async function handleConvert(request: WorkerConvertRequest): Promise<void> {
  const { file, assetPath, limits } = request;
  const started = performance.now();
  let document: PyMuPDFDocument | null = null;

  try {
    if (file.size > limits.maxBytes) {
      throw new ConvertFailure('TOO_LARGE', 'El archivo supera el tamaño máximo.');
    }

    const headerBytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const header = new TextDecoder('latin1').decode(headerBytes);
    if (!header.includes('%PDF-')) {
      throw new ConvertFailure('NOT_PDF', 'El archivo no es un PDF.');
    }

    if (!engineLoaded) {
      post({
        type: 'status',
        stage: 'loading',
        message: 'Preparando el motor de conversión. La primera vez tarda un poco más.'
      });
    }

    const engine = await getEngine(assetPath);

    post({
      type: 'status',
      stage: 'validating',
      message: 'Revisando el PDF…'
    });

    document = await engine.open(file);

    if (document.needsPass) {
      throw new ConvertFailure('PDF_PASSWORD', 'El PDF necesita contraseña.');
    }

    if (document.pageCount === 0) {
      throw new ConvertFailure('PDF_CORRUPT', 'El PDF no tiene páginas legibles.');
    }

    if (document.pageCount > limits.maxPages) {
      throw new ConvertFailure(
        'PDF_TOO_MANY_PAGES',
        `El PDF tiene ${document.pageCount} páginas y el máximo es ${limits.maxPages}.`
      );
    }

    let textLength = 0;
    for (const page of document.pages()) {
      const text = page.getText('text');
      if (typeof text === 'string') textLength += text.length;
      if (textLength >= MIN_TEXT_CHARS) break;
    }

    if (textLength < MIN_TEXT_CHARS) {
      throw new ConvertFailure('PDF_SCANNED', 'El PDF no contiene texto seleccionable.');
    }

    document.close();
    document = null;

    post({
      type: 'status',
      stage: 'converting',
      message: 'Convirtiendo a Word…'
    });

    const blob = await engine.pdfToDocx(file);

    post({
      type: 'result',
      blob,
      elapsedMs: performance.now() - started
    });
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('[pdfWorker]', error);
    }
    post({
      type: 'error',
      ...normalizeFailure(error)
    });
  } finally {
    if (document) {
      try {
        document.close();
      } catch {
        // El documento ya puede estar cerrado o corrupto.
      }
    }
  }
}

const WORD_PAGE_SIZES: Record<WordPageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  a3: { width: 841.89, height: 1190.55 },
  a5: { width: 419.53, height: 595.28 }
};

const FOOTER_MARGIN_PLACEHOLDER = /--pw-footer-margin:\s*0\.0001pt/;

function buildWordHtml(
  page: WorkerConvertWordPage,
  css: string,
  footerMarginTop: number
): string {
  const html = page.html.replace(
    FOOTER_MARGIN_PLACEHOLDER,
    `margin-top: ${footerMarginTop}pt`
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`;
}

interface FooterBounds {
  top: number;
  bottom: number;
}

interface PdfTextBlock {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

function toTextBlock(value: unknown): PdfTextBlock | null {
  if (Array.isArray(value)) {
    const [x0, y0, x1, y1, text] = value;
    if (typeof text !== 'string' || !text.trim()) return null;
    return {
      x0: Number(x0),
      y0: Number(y0),
      x1: Number(x1),
      y1: Number(y1),
      text
    };
  }

  if (value && typeof value === 'object') {
    const block = value as {
      bbox?: { x0: number; y0: number; x1: number; y1: number };
      text?: string;
    };
    if (block.bbox && typeof block.text === 'string' && block.text.trim()) {
      return { ...block.bbox, text: block.text };
    }
  }

  return null;
}

async function findFooterBounds(
  engine: PyMuPDF,
  pdf: Blob,
  footerText: string
): Promise<FooterBounds | null> {
  const document = await engine.open(pdf);

  try {
    const page = document.getPage(0);
    const blocks = page.getText('blocks');
    if (!Array.isArray(blocks)) return null;

    const textBlocks = blocks
      .map(toTextBlock)
      .filter((block): block is PdfTextBlock => block !== null);
    if (textBlocks.length === 0) return null;

    const compact = (value: string) => value.replace(/\s+/g, '');
    const target = compact(footerText).slice(0, 40);
    let start = target
      ? textBlocks.findIndex((block) => compact(block.text).includes(target))
      : -1;
    if (start < 0) start = textBlocks.length - 1;

    const footerBlocks = textBlocks.slice(start);
    return {
      top: Math.min(...footerBlocks.map((block) => block.y0)),
      bottom: Math.max(...footerBlocks.map((block) => block.y1))
    };
  } finally {
    document.close();
  }
}

async function convertWordPage(
  engine: PyMuPDF,
  page: WorkerConvertWordPage,
  css: string
): Promise<Blob> {
  let footerMarginTop = 0;
  let pdf = await engine.htmlToPdf(buildWordHtml(page, css, footerMarginTop), {
    pageSize: page.pageSize,
    margins: 0
  });

  if (!page.footerText) return pdf;

  const size = WORD_PAGE_SIZES[page.pageSize];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const bounds = await findFooterBounds(engine, pdf, page.footerText);
    if (!bounds) return pdf;

    const footerHeight = bounds.bottom - bounds.top;
    const desiredTop = size.height - page.paddingBottom - footerHeight;
    const delta = desiredTop - bounds.top;
    if (delta <= 1) return pdf;

    footerMarginTop += delta;
    pdf = await engine.htmlToPdf(buildWordHtml(page, css, footerMarginTop), {
      pageSize: page.pageSize,
      margins: 0
    });
  }

  return pdf;
}

async function handleConvertWord(request: WorkerConvertWordRequest): Promise<void> {
  const { css, pages, assetPath, limits } = request;
  const started = performance.now();

  try {
    if (pages.length === 0) {
      throw new ConvertFailure('DOCX_CORRUPT', 'El Word no contiene páginas legibles.');
    }

    if (pages.length > limits.maxPages) {
      throw new ConvertFailure(
        'DOCX_TOO_MANY_PAGES',
        `El Word tiene ${pages.length} páginas y el máximo es ${limits.maxPages}.`
      );
    }

    if (!engineLoaded) {
      post({
        type: 'status',
        stage: 'loading',
        message: 'Preparando el motor de conversión. La primera vez tarda un poco más.'
      });
    }

    const engine = await getEngine(assetPath);

    post({
      type: 'status',
      stage: 'converting',
      message: 'Convirtiendo las páginas a PDF…'
    });

    const pdfs: Blob[] = [];
    for (const page of pages) {
      pdfs.push(await convertWordPage(engine, page, css));
    }

    const blob = pdfs.length === 1 ? pdfs[0] : await engine.merge(pdfs);

    post({
      type: 'result',
      blob,
      elapsedMs: performance.now() - started
    });
  } catch (error: unknown) {
    if (import.meta.env.DEV) {
      console.error('[pdfWorker]', error);
    }
    post({
      type: 'error',
      ...normalizeFailure(error, 'word')
    });
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type === 'convert') {
    void handleConvert(event.data);
  } else if (event.data?.type === 'convert-word') {
    void handleConvertWord(event.data);
  }
};
