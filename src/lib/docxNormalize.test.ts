import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { normalizeDocxLayout } from './docxNormalize';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>uno</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr><w:pgSz w:w="11900" w:h="16840"/><w:pgMar w:top="840" w:right="1440" w:bottom="76" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>
<w:p><w:pPr><w:spacing w:line="220"/></w:pPr><w:r><w:t>dos</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr><w:pgSz w:w="11900" w:h="16840"/><w:pgMar w:top="0" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>
<w:p><w:r><w:t>tres</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11900" w:h="16840"/><w:pgMar w:top="0" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

async function buildDocx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('word/document.xml', DOCUMENT_XML);
  return zip.generateAsync({ type: 'blob' });
}

describe('normalizeDocxLayout', () => {
  it('une las secciones con saltos de página y márgenes uniformes', async () => {
    const result = await normalizeDocxLayout(await buildDocx(), {
      leftRatio: 84 / 595,
      rightRatio: 84 / 595
    });
    const zip = await JSZip.loadAsync(result);
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml.match(/<w:sectPr\b/g)).toHaveLength(1);
    expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    expect(xml).not.toContain('<w:pPr><w:sectPr');
    expect(xml).toContain(
      '<w:pgMar w:top="0" w:right="1680" w:bottom="0" w:left="1680" w:header="720" w:footer="720" w:gutter="0"/>'
    );
    expect(xml).toContain('<w:pPr><w:pageBreakBefore/><w:spacing w:line="220"/></w:pPr>');
    expect(xml).toContain('<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>tres</w:t></w:r></w:p>');
  });

  it('devuelve el original si no hay document.xml', async () => {
    const zip = new JSZip();
    zip.file('word/other.xml', '<root/>');
    const blob = await zip.generateAsync({ type: 'blob' });
    const result = await normalizeDocxLayout(blob, { leftRatio: 0.1, rightRatio: 0.1 });
    expect(result).toBe(blob);
  });
});
