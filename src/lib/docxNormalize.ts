import JSZip from 'jszip';

export interface DocxContentMargins {
  leftRatio: number;
  rightRatio: number;
}

const INLINE_SECTION_BREAK =
  /<w:p\b[^>]*><w:pPr><w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr><\/w:pPr><\/w:p>\s*(<w:p\b[^>]*>)\s*(<w:pPr\b[^>]*>)?/g;

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 0.45);
}

export async function normalizeDocxLayout(
  blob: Blob,
  margins: DocxContentMargins
): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return blob;

  let xml = await documentFile.async('string');
  const before = xml;

  const pageWidthMatch = xml.match(/<w:pgSz\b[^>]*\bw:w="(\d+)"/);
  const pageWidth = pageWidthMatch ? Number(pageWidthMatch[1]) : 11900;
  const left = Math.round(pageWidth * clampRatio(margins.leftRatio));
  const right = Math.round(pageWidth * clampRatio(margins.rightRatio));
  const pageMargin = `<w:pgMar w:top="0" w:right="${right}" w:bottom="0" w:left="${left}" w:header="720" w:footer="720" w:gutter="0"/>`;

  xml = xml.replace(INLINE_SECTION_BREAK, (_match, nextParagraph: string, nextPPr?: string) => {
    return nextPPr
      ? `${nextParagraph}${nextPPr}<w:pageBreakBefore/>`
      : `${nextParagraph}<w:pPr><w:pageBreakBefore/></w:pPr>`;
  });

  xml = xml.replace(/<w:pgMar\b[^>]*\/>/g, pageMargin);

  if (xml === before) return blob;

  zip.file('word/document.xml', xml);
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
