import { PyMuPDF, type PyMuPDFDocument } from '@bentopdf/pymupdf-wasm';
import { MIN_TEXT_CHARS } from '../lib/constants';
import type { AppErrorPayload, WorkerMessage, WorkerRequest } from '../types';

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

function normalizeFailure(error: unknown): AppErrorPayload {
  if (error instanceof ConvertFailure) {
    return { code: error.code, message: error.message };
  }

  const raw = error instanceof Error ? error.message : String(error);

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

async function handleConvert(request: WorkerRequest): Promise<void> {
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

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type === 'convert') {
    void handleConvert(event.data);
  }
};
