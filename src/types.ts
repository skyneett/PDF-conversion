export type ConversionMode = 'pdf-to-word' | 'word-to-pdf';

export type UiPhase =
  | 'idle'
  | 'loading'
  | 'validating'
  | 'converting'
  | 'done'
  | 'error'
  | 'cancelled';

export interface ConvertLimits {
  maxBytes: number;
  maxPages: number;
}

export interface WorkerConvertRequest {
  type: 'convert';
  file: File;
  assetPath: string;
  limits: ConvertLimits;
}

export type WordPageSize = 'a4' | 'letter' | 'legal' | 'a3' | 'a5';

export interface WorkerConvertWordPage {
  html: string;
  pageSize: WordPageSize;
  paddingBottom: number;
  footerText: string;
}

export interface WorkerConvertWordRequest {
  type: 'convert-word';
  css: string;
  pages: WorkerConvertWordPage[];
  assetPath: string;
  limits: {
    maxPages: number;
  };
}

export type WorkerRequest = WorkerConvertRequest | WorkerConvertWordRequest;

export interface WorkerStatusMessage {
  type: 'status';
  stage: 'loading' | 'validating' | 'converting';
  message: string;
}

export interface WorkerResultMessage {
  type: 'result';
  blob: Blob;
  elapsedMs: number;
}

export interface WorkerErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type WorkerMessage = WorkerStatusMessage | WorkerResultMessage | WorkerErrorMessage;

export interface AppErrorPayload {
  code: string;
  message: string;
}
