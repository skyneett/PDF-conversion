import JSZip from 'jszip';

export interface PdfHeaderFooterCandidates {
  headers: {
    odd: string[];
    even: string[];
  };
  footers: {
    odd: string[];
    even: string[];
  };
  headerTop: number;
  headerBottom: number;
  headerHeight: number;
  footerTop: number;
  footerBottom: number;
  footerHeight: number;
  pageHeight: number;
}

type ParagraphType = 'header' | 'footer';
type ParagraphParity = 'odd' | 'even' | 'both';

interface DocxParagraph {
  xml: string;
  start: number;
  end: number;
  index: number;
  compact: string;
}

interface ParagraphMatch {
  paragraph: DocxParagraph;
  type: ParagraphType;
  parity: ParagraphParity;
}

const HEADER_ODD_ID = 'rIdPwHeaderOdd';
const HEADER_EVEN_ID = 'rIdPwHeaderEven';
const FOOTER_ODD_ID = 'rIdPwFooterOdd';
const FOOTER_EVEN_ID = 'rIdPwFooterEven';

const HEADER_ODD_PART = 'headerPwOdd.xml';
const HEADER_EVEN_PART = 'headerPwEven.xml';
const FOOTER_ODD_PART = 'footerPwOdd.xml';
const FOOTER_EVEN_PART = 'footerPwEven.xml';

const HEADER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const FOOTER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function paragraphText(xml: string): string {
  let text = '';
  const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(xml))) {
    if (match[1] !== undefined) {
      text += decodeXml(match[1]);
    } else if (match[0].startsWith('<w:br')) {
      text += '\n';
    } else {
      text += '\t';
    }
  }

  return text;
}

export function compactHeaderFooterText(value: string): string {
  return value
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'ft')
    .replace(/\uFB06/g, 'st')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function compactText(value: string): string {
  return compactHeaderFooterText(value);
}

function extractParagraphs(xml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  const paragraphPattern = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(xml))) {
    paragraphs.push({
      xml: match[0],
      start: match.index,
      end: match.index + match[0].length,
      index: paragraphs.length,
      compact: compactText(paragraphText(match[0]))
    });
  }

  return paragraphs;
}

function matchesAny(compact: string, candidates: string[]): boolean {
  return candidates.some((candidate) => candidate.length >= 8 && compact.includes(candidate));
}

function matchParagraphs(
  paragraphs: DocxParagraph[],
  candidates: PdfHeaderFooterCandidates
): ParagraphMatch[] {
  const matches: ParagraphMatch[] = [];

  for (const paragraph of paragraphs) {
    const headerOdd = matchesAny(paragraph.compact, candidates.headers.odd);
    const headerEven = matchesAny(paragraph.compact, candidates.headers.even);
    const footerOdd = matchesAny(paragraph.compact, candidates.footers.odd);
    const footerEven = matchesAny(paragraph.compact, candidates.footers.even);

    if (footerOdd || footerEven) {
      matches.push({
        paragraph,
        type: 'footer',
        parity: footerOdd && footerEven ? 'both' : footerOdd ? 'odd' : 'even'
      });
    } else if (headerOdd || headerEven) {
      matches.push({
        paragraph,
        type: 'header',
        parity: headerOdd && headerEven ? 'both' : headerOdd ? 'odd' : 'even'
      });
    }
  }

  return matches;
}

function groupRuns(
  matches: ParagraphMatch[],
  type: ParagraphType,
  parity: ParagraphParity,
  paragraphs: DocxParagraph[]
): DocxParagraph[][] {
  const filtered = matches
    .filter(
      (match) =>
        match.type === type && (match.parity === parity || match.parity === 'both')
    )
    .map((match) => match.paragraph)
    .sort((left, right) => left.index - right.index);

  if (filtered.length === 0) return [];

  const runs: DocxParagraph[][] = [];
  let current: DocxParagraph[] = [filtered[0]];

  for (let index = 1; index < filtered.length; index += 1) {
    const previous = filtered[index - 1];
    const next = filtered[index];
    const between = paragraphs.slice(previous.index + 1, next.index);
    const onlyEmpty = between.length > 0 && between.every((paragraph) => !paragraph.compact);

    if (next.index === previous.index + 1 || onlyEmpty) {
      current.push(next);
    } else {
      runs.push(current);
      current = [next];
    }
  }
  runs.push(current);

  return runs;
}

function runSignature(paragraphs: DocxParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.compact).join('|');
}

function firstRunWithDuplicates(runs: DocxParagraph[][]): {
  primary: DocxParagraph[];
  duplicates: DocxParagraph[];
} {
  if (runs.length === 0) return { primary: [], duplicates: [] };

  const [primary, ...rest] = runs;
  const signature = runSignature(primary);
  return {
    primary,
    duplicates: rest
      .filter((run) => runSignature(run) === signature)
      .flat()
  };
}

function wrapPart(tag: 'hdr' | 'ftr', attributes: string, paragraphs: DocxParagraph[]): string {
  const content =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => paragraph.xml).join('')
      : '<w:p/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag}${attributes}>${content}</w:${tag}>`;
}

function removeParagraphs(xml: string, paragraphs: DocxParagraph[]): string {
  const unique = [...new Map(paragraphs.map((paragraph) => [paragraph.index, paragraph])).values()];
  const ordered = unique.sort((left, right) => right.start - left.start);
  let result = xml;

  for (const paragraph of ordered) {
    result = result.slice(0, paragraph.start) + result.slice(paragraph.end);
  }

  return result;
}

function removeEmptyParagraphs(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (paragraphText(paragraph).trim()) return paragraph;
    if (/<w:drawing\b|<w:pict\b|<w:br\b|<w:tab\b|<w:object\b|<w:fldChar\b|<w:instrText\b/.test(paragraph)) {
      return paragraph;
    }
    return '';
  });
}

function resetFirstParagraphSpacing(paragraphs: DocxParagraph[]): DocxParagraph[] {
  return paragraphs.map((paragraph, index) => {
    let xml = paragraph.xml.replace(
      /<w:ind\b[^>]*\/>/,
      '<w:ind w:left="0" w:right="0" w:firstLine="0"/>'
    );

    if (index === 0) {
      xml = xml.replace(
        /<w:spacing\b([^>]*)\bw:before="\d+"([^>]*)\/>/,
        '<w:spacing$1w:before="0"$2/>'
      );
    }

    return { ...paragraph, xml };
  });
}

function updateContentTypes(
  xml: string,
  hasHeaders: boolean,
  hasFooters: boolean
): string {
  const overrides: string[] = [];
  if (hasHeaders) {
    overrides.push(
      `<Override PartName="/word/${HEADER_ODD_PART}" ContentType="${HEADER_CONTENT_TYPE}"/>`,
      `<Override PartName="/word/${HEADER_EVEN_PART}" ContentType="${HEADER_CONTENT_TYPE}"/>`
    );
  }
  if (hasFooters) {
    overrides.push(
      `<Override PartName="/word/${FOOTER_ODD_PART}" ContentType="${FOOTER_CONTENT_TYPE}"/>`,
      `<Override PartName="/word/${FOOTER_EVEN_PART}" ContentType="${FOOTER_CONTENT_TYPE}"/>`
    );
  }

  const additions = overrides
    .filter((override) => !xml.includes(override))
    .join('');
  return additions ? xml.replace('</Types>', `${additions}</Types>`) : xml;
}

function updateRelationships(
  xml: string,
  hasHeaders: boolean,
  hasFooters: boolean
): string {
  const relationships: string[] = [];
  if (hasHeaders) {
    relationships.push(
      `<Relationship Id="${HEADER_ODD_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="${HEADER_ODD_PART}"/>`,
      `<Relationship Id="${HEADER_EVEN_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="${HEADER_EVEN_PART}"/>`
    );
  }
  if (hasFooters) {
    relationships.push(
      `<Relationship Id="${FOOTER_ODD_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="${FOOTER_ODD_PART}"/>`,
      `<Relationship Id="${FOOTER_EVEN_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="${FOOTER_EVEN_PART}"/>`
    );
  }

  const additions = relationships
    .filter((relationship) => !xml.includes(relationship))
    .join('');
  return additions ? xml.replace('</Relationships>', `${additions}</Relationships>`) : xml;
}

function updateSettings(xml: string): string {
  if (xml.includes('<w:evenAndOddHeaders/>')) return xml;

  const element = '<w:evenAndOddHeaders/>';
  if (xml.includes('<w:compat')) {
    return xml.replace('<w:compat', `${element}<w:compat`);
  }
  return xml.replace('</w:settings>', `${element}</w:settings>`);
}

function updateSections(
  xml: string,
  references: string,
  margins: { top: number; right: number; bottom: number; left: number; header: number; footer: number }
): string {
  let result = xml;

  if (references) {
    result = result.replace(/<w:sectPr\b[^>]*>/g, (tag) => `${tag}${references}`);
  }

  return result.replace(
    /<w:pgMar\b[^>]*\/>/g,
    `<w:pgMar w:top="${margins.top}" w:right="${margins.right}" w:bottom="${margins.bottom}" w:left="${margins.left}" w:header="${margins.header}" w:footer="${margins.footer}" w:gutter="0"/>`
  );
}

function readExistingMargins(xml: string): { left: number; right: number } {
  const tag = xml.match(/<w:pgMar\b[^>]*\/>/)?.[0];
  if (!tag) return { left: 1680, right: 1680 };

  const left = tag.match(/\bw:left="(\d+)"/);
  const right = tag.match(/\bw:right="(\d+)"/);
  return {
    left: left ? Number(left[1]) : 1680,
    right: right ? Number(right[1]) : 1680
  };
}

export async function applyPdfHeadersFooters(
  blob: Blob,
  candidates: PdfHeaderFooterCandidates
): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return blob;

  let documentXml = await documentFile.async('string');
  const paragraphs = extractParagraphs(documentXml);
  const matches = matchParagraphs(paragraphs, candidates);
  if (matches.length === 0) return blob;

  const headerOddRuns = firstRunWithDuplicates(
    groupRuns(matches, 'header', 'odd', paragraphs)
  );
  const headerEvenRuns = firstRunWithDuplicates(
    groupRuns(matches, 'header', 'even', paragraphs)
  );
  const footerOddRuns = firstRunWithDuplicates(
    groupRuns(matches, 'footer', 'odd', paragraphs)
  );
  const footerEvenRuns = firstRunWithDuplicates(
    groupRuns(matches, 'footer', 'even', paragraphs)
  );

  const oddHeader = resetFirstParagraphSpacing(headerOddRuns.primary);
  const evenHeader = resetFirstParagraphSpacing(headerEvenRuns.primary);
  const oddFooter = resetFirstParagraphSpacing(footerOddRuns.primary);
  const evenFooter = resetFirstParagraphSpacing(footerEvenRuns.primary);

  const hasHeaders = oddHeader.length > 0 || evenHeader.length > 0;
  const hasFooters = oddFooter.length > 0 || evenFooter.length > 0;
  if (!hasHeaders && !hasFooters) return blob;

  const removable = [
    headerOddRuns.primary,
    headerOddRuns.duplicates,
    headerEvenRuns.primary,
    headerEvenRuns.duplicates,
    footerOddRuns.primary,
    footerOddRuns.duplicates,
    footerEvenRuns.primary,
    footerEvenRuns.duplicates
  ].flat();

  const rootMatch = documentXml.match(/<w:document\b([^>]*)>/);
  const attributes =
    rootMatch?.[1] ??
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  if (hasHeaders) {
    zip.file(`word/${HEADER_ODD_PART}`, wrapPart('hdr', attributes, oddHeader));
    zip.file(`word/${HEADER_EVEN_PART}`, wrapPart('hdr', attributes, evenHeader));
  }
  if (hasFooters) {
    zip.file(`word/${FOOTER_ODD_PART}`, wrapPart('ftr', attributes, oddFooter));
    zip.file(`word/${FOOTER_EVEN_PART}`, wrapPart('ftr', attributes, evenFooter));
  }

  documentXml = removeParagraphs(documentXml, removable);
  documentXml = documentXml.replace(/<w:pageBreakBefore\/>/g, '');
  documentXml = removeEmptyParagraphs(documentXml);

  const existingMargins = readExistingMargins(documentXml);
  const top = hasHeaders
    ? Math.ceil(
        Math.max(candidates.headerBottom, candidates.headerTop + candidates.headerHeight) + 10
      )
    : 0;
  const header = hasHeaders ? Math.max(0, Math.round(candidates.headerTop)) : 0;
  const bottom = hasFooters ? Math.ceil(candidates.footerHeight + 20) : 0;
  const footer = hasFooters ? 8 : 0;
  const margins = {
    top: top * 20,
    right: existingMargins.right,
    bottom: bottom * 20,
    left: existingMargins.left,
    header: header * 20,
    footer: footer * 20
  };

  const references = [
    hasHeaders ? `<w:headerReference w:type="default" r:id="${HEADER_ODD_ID}"/>` : '',
    hasHeaders ? `<w:headerReference w:type="even" r:id="${HEADER_EVEN_ID}"/>` : '',
    hasFooters ? `<w:footerReference w:type="default" r:id="${FOOTER_ODD_ID}"/>` : '',
    hasFooters ? `<w:footerReference w:type="even" r:id="${FOOTER_EVEN_ID}"/>` : ''
  ].join('');

  documentXml = updateSections(documentXml, references, margins);
  zip.file('word/document.xml', documentXml);

  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const contentTypes = await contentTypesFile.async('string');
    zip.file(
      '[Content_Types].xml',
      updateContentTypes(contentTypes, hasHeaders, hasFooters)
    );
  }

  const relationshipsFile = zip.file('word/_rels/document.xml.rels');
  if (relationshipsFile) {
    const relationships = await relationshipsFile.async('string');
    zip.file(
      'word/_rels/document.xml.rels',
      updateRelationships(relationships, hasHeaders, hasFooters)
    );
  }

  const settingsFile = zip.file('word/settings.xml');
  if (settingsFile) {
    const settings = await settingsFile.async('string');
    zip.file('word/settings.xml', updateSettings(settings));
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
