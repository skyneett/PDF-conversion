import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  applyPdfHeadersFooters,
  compactHeaderFooterText,
  type PdfHeaderFooterCandidates
} from './docxHeadersFooters';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
<w:p><w:pPr><w:spacing w:before="0"/></w:pPr><w:r><w:t>HEADER ODD</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:before="8284"/><w:ind w:left="240" w:right="144" w:firstLine="0"/></w:pPr><w:r><w:t>FOOTER ODD LINE 1</w:t></w:r></w:p>
<w:p><w:r><w:t>FOOTER ODD LINE 2</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:before="100"/></w:pPr><w:r><w:t>BODY ONE</w:t></w:r></w:p>
<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>FOOTER EVEN</w:t></w:r></w:p>
<w:p><w:r><w:t>BODY TWO</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:before="0"/></w:pPr></w:p>
<w:sectPr><w:pgSz w:w="11900" w:h="16840"/><w:pgMar w:top="0" w:right="1680" w:bottom="0" w:left="1680" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`;

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:compat/></w:settings>`;

const CANDIDATES: PdfHeaderFooterCandidates = {
  headers: { odd: ['headerodd'], even: [] },
  footers: { odd: ['footeroddline1', 'footeroddline2'], even: ['footereven'] },
  headerTop: 130,
  headerBottom: 151,
  headerHeight: 21,
  footerTop: 536,
  footerBottom: 621,
  footerHeight: 56,
  pageHeight: 842
};

async function buildDocx(documentXml = DOCUMENT_XML): Promise<Blob> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('word/_rels/document.xml.rels', RELATIONSHIPS);
  zip.file('word/settings.xml', SETTINGS);
  return zip.generateAsync({ type: 'blob' });
}

async function readPart(blob: Blob, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  return zip.file(path)!.async('string');
}

describe('compactHeaderFooterText', () => {
  it('normaliza ligaduras y espacios', () => {
    expect(compactHeaderFooterText('Documento OﬁCIAL')).toBe('documentooficial');
    expect(compactHeaderFooterText('a ﬂujo ﬁnal')).toBe('aflujofinal');
  });
});

describe('applyPdfHeadersFooters', () => {
  it('mueve header/footer al cuerpo de Word y ajusta la sección', async () => {
    const result = await applyPdfHeadersFooters(await buildDocx(), CANDIDATES);
    const documentXml = await readPart(result, 'word/document.xml');
    const headerOdd = await readPart(result, 'word/headerPwOdd.xml');
    const headerEven = await readPart(result, 'word/headerPwEven.xml');
    const footerOdd = await readPart(result, 'word/footerPwOdd.xml');
    const footerEven = await readPart(result, 'word/footerPwEven.xml');
    const settings = await readPart(result, 'word/settings.xml');
    const rels = await readPart(result, 'word/_rels/document.xml.rels');
    const contentTypes = await readPart(result, '[Content_Types].xml');

    expect(documentXml).toContain('BODY ONE');
    expect(documentXml).toContain('BODY TWO');
    expect(documentXml).not.toContain('HEADER ODD');
    expect(documentXml).not.toContain('FOOTER ODD');
    expect(documentXml).not.toContain('FOOTER EVEN');
    expect(documentXml).not.toContain('<w:pageBreakBefore/>');
    expect(documentXml.match(/<w:p\b/g)).toHaveLength(2);
    expect(documentXml).toContain('w:top="3220"');
    expect(documentXml).toContain('w:bottom="1520"');
    expect(documentXml).toContain('w:header="2600"');
    expect(documentXml).toContain('w:footer="160"');
    expect(documentXml).toContain('<w:headerReference w:type="default" r:id="rIdPwHeaderOdd"/>');
    expect(documentXml).toContain('<w:headerReference w:type="even" r:id="rIdPwHeaderEven"/>');
    expect(documentXml).toContain('<w:footerReference w:type="default" r:id="rIdPwFooterOdd"/>');
    expect(documentXml).toContain('<w:footerReference w:type="even" r:id="rIdPwFooterEven"/>');

    expect(headerOdd).toContain('HEADER ODD');
    expect(headerEven).toContain('<w:p/>');
    expect(headerEven).not.toContain('HEADER ODD');
    expect(footerOdd).toContain('FOOTER ODD LINE 1');
    expect(footerOdd).toContain('FOOTER ODD LINE 2');
    expect(footerOdd).toContain('<w:ind w:left="0" w:right="0" w:firstLine="0"/>');
    expect(footerEven).toContain('FOOTER EVEN');

    expect(settings).toContain('<w:evenAndOddHeaders/><w:compat/>');
    expect(rels).toContain('rIdPwHeaderOdd');
    expect(rels).toContain('rIdPwFooterEven');
    expect(contentTypes).toContain('/word/headerPwOdd.xml');
    expect(contentTypes).toContain('/word/footerPwEven.xml');
  });

  it('no elimina un bloque distinto que coincide con un candidato', async () => {
    const customDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
<w:p><w:r><w:t>FOOTER ODD LINE 1</w:t></w:r></w:p>
<w:p><w:r><w:t>FOOTER ODD LINE 2</w:t></w:r></w:p>
<w:p><w:r><w:t>BODY</w:t></w:r></w:p>
<w:p><w:r><w:t>FOOTER ODD ALT</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11900" w:h="16840"/><w:pgMar w:top="0" w:right="1680" w:bottom="0" w:left="1680" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

    const result = await applyPdfHeadersFooters(await buildDocx(customDocument), {
      ...CANDIDATES,
      headers: { odd: [], even: [] },
      footers: { odd: ['footeroddline1', 'footeroddline2', 'footeroddalt'], even: [] }
    });
    const documentXml = await readPart(result, 'word/document.xml');
    const footerOdd = await readPart(result, 'word/footerPwOdd.xml');

    expect(documentXml).toContain('BODY');
    expect(documentXml).toContain('FOOTER ODD ALT');
    expect(documentXml).not.toContain('FOOTER ODD LINE 1');
    expect(footerOdd).toContain('FOOTER ODD LINE 1');
    expect(footerOdd).not.toContain('FOOTER ODD ALT');
  });

  it('no elimina contenido cuando el mismo header aplica a pares e impares', async () => {
    const customDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
<w:p><w:r><w:t>HEADER BOTH</w:t></w:r></w:p>
<w:p><w:r><w:t>BODY ONE</w:t></w:r></w:p>
<w:p><w:r><w:t>HEADER BOTH</w:t></w:r></w:p>
<w:p><w:r><w:t>BODY TWO</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11900" w:h="16840"/><w:pgMar w:top="0" w:right="1680" w:bottom="0" w:left="1680" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

    const result = await applyPdfHeadersFooters(await buildDocx(customDocument), {
      ...CANDIDATES,
      headers: { odd: ['headerboth'], even: ['headerboth'] },
      footers: { odd: [], even: [] }
    });
    const documentXml = await readPart(result, 'word/document.xml');
    const headerOdd = await readPart(result, 'word/headerPwOdd.xml');
    const headerEven = await readPart(result, 'word/headerPwEven.xml');

    expect(documentXml).toContain('BODY ONE');
    expect(documentXml).toContain('BODY TWO');
    expect(documentXml).not.toContain('HEADER BOTH');
    expect(headerOdd).toContain('HEADER BOTH');
    expect(headerEven).toContain('HEADER BOTH');
  });

  it('devuelve el original si no hay párrafos que coincidan', async () => {
    const blob = await buildDocx();
    const result = await applyPdfHeadersFooters(blob, {
      ...CANDIDATES,
      headers: { odd: ['NO EXISTE'], even: [] },
      footers: { odd: [], even: [] }
    });
    expect(result).toBe(blob);
  });
});
