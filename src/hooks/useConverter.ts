import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSET_DIRECTORY, MAX_FILE_BYTES, MAX_PAGES } from '../lib/constants';
import { messageForCode } from '../lib/errors';
import { sanitizeDownloadName } from '../lib/filename';
import { validateSelectedFile } from '../lib/validation';
import type { AppErrorPayload, UiPhase, WorkerMessage } from '../types';

interface ConverterState {
  phase: UiPhase;
  file: File | null;
  error: AppErrorPayload | null;
  resultUrl: string | null;
  resultName: string | null;
  resultSize: number;
  elapsedMs: number;
  statusMessage: string;
}

const INITIAL_STATE: ConverterState = {
  phase: 'idle',
  file: null,
  error: null,
  resultUrl: null,
  resultName: null,
  resultSize: 0,
  elapsedMs: 0,
  statusMessage: ''
};

function isBusyPhase(phase: UiPhase): boolean {
  return phase === 'loading' || phase === 'validating' || phase === 'converting';
}

function triggerDownload(url: string, name: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

const PHASE_MESSAGES: Record<'loading' | 'validating' | 'converting', string> = {
  loading: 'Preparando el motor de conversión…',
  validating: 'Revisando el PDF…',
  converting: 'Convirtiendo a Word…'
};

export function useConverter() {
  const [state, setState] = useState<ConverterState>(INITIAL_STATE);
  const workerRef = useRef<Worker | null>(null);
  const fileRef = useRef<File | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const revokeResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
  }, []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL('../worker/pdfWorker.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if (message.type === 'status') {
        setState((previous) => ({
          ...previous,
          phase: message.stage,
          statusMessage: message.message
        }));
        return;
      }

      if (message.type === 'result') {
        const url = URL.createObjectURL(message.blob);
        revokeResult();
        resultUrlRef.current = url;

        const name = sanitizeDownloadName(fileRef.current?.name ?? 'documento.pdf');

        setState((previous) => ({
          ...previous,
          phase: 'done',
          error: null,
          resultUrl: url,
          resultName: name,
          resultSize: message.blob.size,
          elapsedMs: message.elapsedMs,
          statusMessage: 'Listo'
        }));

        triggerDownload(url, name);
        return;
      }

      const friendly =
        message.code === 'PDF_TOO_MANY_PAGES' || message.code === 'TOO_LARGE'
          ? message.message
          : messageForCode(message.code, message.message);

      setState((previous) => ({
        ...previous,
        phase: 'error',
        error: { code: message.code, message: friendly },
        statusMessage: ''
      }));
    };

    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      setState((previous) => ({
        ...previous,
        phase: 'error',
        error: {
          code: 'INTERNAL',
          message: 'El motor de conversión falló. Recarga la página e inténtalo de nuevo.'
        },
        statusMessage: ''
      }));
    };

    workerRef.current = worker;
    return worker;
  }, [revokeResult]);

  const selectFile = useCallback(
    (file: File) => {
      const validation = validateSelectedFile(file, MAX_FILE_BYTES);

      if (validation) {
        revokeResult();
        fileRef.current = null;
        setState({
          ...INITIAL_STATE,
          phase: 'error',
          error: validation
        });
        return;
      }

      revokeResult();
      fileRef.current = file;
      setState({
        ...INITIAL_STATE,
        file
      });
    },
    [revokeResult]
  );

  const convert = useCallback(() => {
    const file = fileRef.current;
    if (!file || isBusyPhase(state.phase)) return;

    revokeResult();
    setState((previous) => ({
      ...previous,
      phase: 'loading',
      error: null,
      resultUrl: null,
      resultName: null,
      resultSize: 0,
      elapsedMs: 0,
      statusMessage: PHASE_MESSAGES.loading
    }));

    const worker = ensureWorker();
    worker.postMessage({
      type: 'convert',
      file,
      assetPath: new URL(ASSET_DIRECTORY, document.baseURI).href,
      limits: {
        maxBytes: MAX_FILE_BYTES,
        maxPages: MAX_PAGES
      }
    });
  }, [ensureWorker, revokeResult, state.phase]);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    revokeResult();
    setState((previous) => ({
      ...previous,
      phase: 'cancelled',
      resultUrl: null,
      resultName: null,
      resultSize: 0,
      elapsedMs: 0,
      statusMessage: ''
    }));
  }, [revokeResult]);

  const reset = useCallback(() => {
    if (workerRef.current && isBusyPhase(state.phase)) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    revokeResult();
    fileRef.current = null;
    setState(INITIAL_STATE);
  }, [revokeResult, state.phase]);

  const download = useCallback(() => {
    if (state.resultUrl && state.resultName) {
      triggerDownload(state.resultUrl, state.resultName);
    }
  }, [state.resultName, state.resultUrl]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    isBusy: isBusyPhase(state.phase),
    selectFile,
    convert,
    cancel,
    reset,
    download
  };
}
