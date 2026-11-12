import type { AppErrorPayload } from '../types';
import { formatBytes } from './format';

export function validateSelectedFile(file: File, maxBytes: number): AppErrorPayload | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (!isPdf) {
    return {
      code: 'NOT_PDF',
      message: 'Selecciona un archivo PDF. Otros formatos todavía no están disponibles.'
    };
  }

  if (file.size === 0) {
    return {
      code: 'NOT_PDF',
      message: 'El archivo está vacío. Elige un PDF válido.'
    };
  }

  if (file.size > maxBytes) {
    return {
      code: 'TOO_LARGE',
      message: `El PDF pesa más de ${formatBytes(maxBytes)}. Prueba con un archivo más pequeño.`
    };
  }

  return null;
}
