import { describe, expect, it } from 'vitest';
import { sanitizeDownloadName } from './filename';

describe('sanitizeDownloadName', () => {
  it('cambia la extensión a .docx', () => {
    expect(sanitizeDownloadName('Informe 2026.pdf')).toBe('Informe 2026.docx');
  });

  it('elimina rutas y deja solo el nombre', () => {
    expect(sanitizeDownloadName('../../evil.pdf')).toBe('evil.docx');
    expect(sanitizeDownloadName('C:\\Users\\yo\\Mi PDF.PDF')).toBe('Mi PDF.docx');
  });

  it('limpia caracteres peligrosos', () => {
    expect(sanitizeDownloadName('a<>:"|?*b.pdf')).toBe('a b.docx');
  });

  it('usa un nombre por defecto si no queda nada', () => {
    expect(sanitizeDownloadName('..')).toBe('documento.docx');
    expect(sanitizeDownloadName('')).toBe('documento.docx');
  });

  it('normaliza unicode', () => {
    expect(sanitizeDownloadName('Cafe\u0301.pdf')).toBe('Café.docx');
  });

  it('limita la longitud del nombre', () => {
    const result = sanitizeDownloadName(`${'a'.repeat(200)}.pdf`);
    expect(result.length).toBeLessThanOrEqual(85);
    expect(result.endsWith('.docx')).toBe(true);
  });

  it('puede generar un nombre .pdf para Word a PDF', () => {
    expect(sanitizeDownloadName('Informe.docx', 'pdf')).toBe('Informe.pdf');
    expect(sanitizeDownloadName('C:\\Users\\yo\\Mi Word.DOCX', 'pdf')).toBe('Mi Word.pdf');
  });
});
