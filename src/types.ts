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

export type WorkerRequest = WorkerConvertRequest;

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
