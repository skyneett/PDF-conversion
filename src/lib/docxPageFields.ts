import JSZip from 'jszip';

export const PAGE_PLACEHOLDER = '{{PW_PAGE}}';
export const TOTAL_PAGES_PLACEHOLDER = '{{PW_NUMPAGES}}';

const COMPLEX_FIELD = /<w:fldChar\b[^>]*w:fldCharType="begin"[^>]*\/*>[\s\S]*?<w:fldChar\b[^>]*w:fldCharType="end"[^>]*\/*>/g;
const INSTRUCTION = /<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g;
const SIMPLE_FIELD = /<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>[\s\S]*?<\/w:fldSimple>/g;
const SIMPLE_FIELD_EMPTY = /<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*\/>/g;
const TARGET_PART = /^word\/(?:header\d*|footer\d*|document|footnotes|endnotes)\.xml$/;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function placeholderFor(instruction: string): string | null {
  const normalized = decodeXml(instruction).toUpperCase();
  if (/\bNUMPAGES\b/.test(normalized)) return TOTAL_PAGES_PLACEHOLDER;
  if (/\bPAGE\b/.test(normalized)) return PAGE_PLACEHOLDER;
  return null;
}

function placeholderText(placeholder: string): string {
  return `<w:t xml:space="preserve">${placeholder}</w:t>`;
}

function placeholderRun(placeholder: string): string {
  return `<w:r>${placeholderText(placeholder)}</w:r>`;
}

export function replacePageFieldsInXml(xml: string): string {
  const withoutComplexFields = xml.replace(COMPLEX_FIELD, (field) => {
    const instructions = [...field.matchAll(INSTRUCTION)]
      .map((match) => match[1])
      .join(' ');
    if (!instructions) return field;

    const placeholder = placeholderFor(instructions);
    return placeholder ? placeholderText(placeholder) : field;
  });

  const withoutSimpleFields = withoutComplexFields.replace(SIMPLE_FIELD, (field, instruction) => {
    const placeholder = placeholderFor(String(instruction));
    return placeholder ? placeholderRun(placeholder) : field;
  });

  return withoutSimpleFields.replace(SIMPLE_FIELD_EMPTY, (field, instruction) => {
    const placeholder = placeholderFor(String(instruction));
    return placeholder ? placeholderRun(placeholder) : field;
  });
}

export async function prepareDocxPageFields(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const parts = Object.keys(zip.files).filter((path) => TARGET_PART.test(path));
  let changed = false;

  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;

    const xml = await file.async('string');
    const replaced = replacePageFieldsInXml(xml);
    if (replaced === xml) continue;

    zip.file(path, replaced);
    changed = true;
  }

  if (!changed) return blob;

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export function replacePagePlaceholders(
  root: HTMLElement,
  pageNumber: number,
  totalPages: number
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text) nodes.push(node);
  }

  for (const node of nodes) {
    if (
      !node.data.includes(PAGE_PLACEHOLDER) &&
      !node.data.includes(TOTAL_PAGES_PLACEHOLDER)
    ) {
      continue;
    }

    node.data = node.data
      .split(PAGE_PLACEHOLDER)
      .join(String(pageNumber))
      .split(TOTAL_PAGES_PLACEHOLDER)
      .join(String(totalPages));
  }
}
