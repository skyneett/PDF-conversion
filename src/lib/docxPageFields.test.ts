import { describe, expect, it } from 'vitest';
import {
  PAGE_PLACEHOLDER,
  TOTAL_PAGES_PLACEHOLDER,
  replacePageFieldsInXml
} from './docxPageFields';

function complexField(instruction: string, result: string): string {
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

describe('replacePageFieldsInXml', () => {
  it('convierte un campo PAGE en un marcador', () => {
    const xml = `<w:p>${complexField('PAGE \\* MERGEFORMAT', '1')}</w:p>`;
    const result = replacePageFieldsInXml(xml);

    expect(result).toContain(PAGE_PLACEHOLDER);
    expect(result).not.toContain('instrText');
    expect(result).not.toContain('MERGEFORMAT');
  });

  it('funciona cuando el campo está dentro de un solo run', () => {
    const xml =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve"> PAGE </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>1</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    const result = replacePageFieldsInXml(xml);

    expect(result).toContain(PAGE_PLACEHOLDER);
    expect(result).not.toContain('<w:r><w:r>');
    expect(result.match(/<w:r>/g)).toHaveLength(1);
  });

  it('convierte NUMPAGES antes que PAGE', () => {
    const xml = `<w:p>${complexField('NUMPAGES', '6')}</w:p>`;
    const result = replacePageFieldsInXml(xml);

    expect(result).toContain(TOTAL_PAGES_PLACEHOLDER);
    expect(result).not.toContain(PAGE_PLACEHOLDER);
  });

  it('convierte campos simples', () => {
    const xml = '<w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>';
    const result = replacePageFieldsInXml(xml);

    expect(result).toContain(PAGE_PLACEHOLDER);
    expect(result).not.toContain('<w:fldSimple');
  });

  it('deja intactos los campos que no son de página', () => {
    const xml = `<w:p>${complexField('DATE', '24/11/2026')}</w:p>`;
    expect(replacePageFieldsInXml(xml)).toBe(xml);
  });

  it('no confunde SECTIONPAGES con PAGE', () => {
    const xml = `<w:p>${complexField('SECTIONPAGES', '2')}</w:p>`;
    expect(replacePageFieldsInXml(xml)).toBe(xml);
  });

  it('devuelve el XML igual si no hay campos', () => {
    const xml = '<w:p><w:r><w:t>FOOTER</w:t></w:r></w:p>';
    expect(replacePageFieldsInXml(xml)).toBe(xml);
  });
});
