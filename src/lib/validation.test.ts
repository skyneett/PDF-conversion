import { describe, expect, it } from 'vitest';
import { validateSelectedFile } from './validation';

function makeFile(name: string, size: number, type = 'application/pdf'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('validateSelectedFile', () => {
  it('acepta un PDF dentro del límite', () => {
    expect(validateSelectedFile(makeFile('doc.pdf', 10), 100)).toBeNull();
  });

  it('acepta PDF por extensión aunque el MIME venga vacío', () => {
    expect(validateSelectedFile(makeFile('doc.pdf', 10, ''), 100)).toBeNull();
  });

  it('rechaza otros formatos', () => {
    const error = validateSelectedFile(makeFile('foto.png', 10, 'image/png'), 100);
    expect(error?.code).toBe('NOT_PDF');
  });

  it('rechaza archivos vacíos', () => {
    const error = validateSelectedFile(makeFile('vacio.pdf', 0), 100);
    expect(error?.code).toBe('NOT_PDF');
  });

  it('rechaza archivos demasiado grandes', () => {
    const error = validateSelectedFile(makeFile('grande.pdf', 11), 10);
    expect(error?.code).toBe('TOO_LARGE');
  });

  it('acepta un DOCX en modo Word a PDF', () => {
    expect(validateSelectedFile(makeFile('doc.docx', 10, ''), 100, 'word-to-pdf')).toBeNull();
  });

  it('rechaza un PDF en modo Word a PDF', () => {
    const error = validateSelectedFile(makeFile('doc.pdf', 10), 100, 'word-to-pdf');
    expect(error?.code).toBe('NOT_DOCX');
  });

  it('rechaza un DOCX en modo PDF a Word', () => {
    const error = validateSelectedFile(makeFile('doc.docx', 10, ''), 100, 'pdf-to-word');
    expect(error?.code).toBe('NOT_PDF');
  });

  it('rechaza un DOCX vacío', () => {
    const error = validateSelectedFile(makeFile('vacio.docx', 0, ''), 100, 'word-to-pdf');
    expect(error?.code).toBe('DOCX_CORRUPT');
  });
});
