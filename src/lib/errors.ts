import type { AppErrorPayload } from '../types';

const MESSAGES: Record<string, string> = {
  NOT_PDF: 'El archivo no parece un PDF válido.',
  NOT_DOCX: 'El archivo no parece un Word .docx válido.',
  TOO_LARGE: 'El archivo supera el tamaño máximo permitido.',
  DOCX_CORRUPT: 'El Word está dañado o tiene una estructura que no se puede leer.',
  DOCX_TOO_MANY_PAGES: 'El Word tiene más páginas de las permitidas.',
  PDF_PASSWORD: 'El PDF está protegido con contraseña. Quita la protección e inténtalo de nuevo.',
  PDF_SCANNED:
    'El PDF parece escaneado (solo imágenes). Este conversor necesita texto seleccionable.',
  PDF_TOO_MANY_PAGES: 'El PDF tiene más páginas de las permitidas.',
  PDF_CORRUPT: 'El PDF está dañado o tiene una estructura que no se puede leer.',
  ENGINE_LOAD: 'No se pudo cargar el motor de conversión. Revisa tu conexión e inténtalo de nuevo.',
  INTERNAL: 'No se pudo convertir el PDF. Prueba con otro archivo.'
};

export function messageForCode(code: string, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? MESSAGES.INTERNAL;
}

export function toAppError(error: unknown): AppErrorPayload {
  if (isAppError(error)) return error;

  return {
    code: 'INTERNAL',
    message: MESSAGES.INTERNAL
  };
}

function isAppError(value: unknown): value is AppErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppErrorPayload).code === 'string' &&
    typeof (value as AppErrorPayload).message === 'string'
  );
}
