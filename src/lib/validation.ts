import type { AppErrorPayload, ConversionMode } from '../types';
import { formatBytes } from './format';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function validateSelectedFile(
  file: File,
  maxBytes: number,
  mode: ConversionMode = 'pdf-to-word'
): AppErrorPayload | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isDocx = file.type === DOCX_MIME || /\.docx$/i.test(file.name);

  if (mode === 'pdf-to-word' && !isPdf) {
    return {
      code: 'NOT_PDF',
      message: 'Selecciona un archivo PDF. Otros formatos todavía no están disponibles.'
    };
  }

  if (mode === 'word-to-pdf' && !isDocx) {
    return {
      code: 'NOT_DOCX',
      message: 'Selecciona un archivo Word (.docx). El formato .doc antiguo no es compatible.'
    };
  }

  if (file.size === 0) {
    return {
      code: mode === 'word-to-pdf' ? 'DOCX_CORRUPT' : 'NOT_PDF',
      message:
        mode === 'word-to-pdf'
          ? 'El archivo Word está vacío. Elige un .docx válido.'
          : 'El archivo está vacío. Elige un PDF válido.'
    };
  }

  if (file.size > maxBytes) {
    return {
      code: 'TOO_LARGE',
      message: `El archivo pesa más de ${formatBytes(maxBytes)}. Prueba con uno más pequeño.`
    };
  }

  return null;
}
