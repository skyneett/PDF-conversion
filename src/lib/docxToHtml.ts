import { renderAsync } from 'docx-preview';
import {
  prepareDocxPageFields,
  replacePagePlaceholders
} from './docxPageFields';
import type { WordPageSize, WorkerConvertWordPage } from '../types';

export interface RenderedDocx {
  css: string;
  pages: WorkerConvertWordPage[];
}

const PAGE_SIZES: Record<WordPageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  a3: { width: 841.89, height: 1190.55 },
  a5: { width: 419.53, height: 595.28 }
};

export class DocxRenderError extends Error {
  constructor(
    public readonly code: 'DOCX_CORRUPT' | 'DOCX_TOO_MANY_PAGES',
    message: string
  ) {
    super(message);
    this.name = 'DocxRenderError';
  }
}

const PAGE_CSS = `
html,
body {
  margin: 0;
  padding: 0;
  background: #fff;
}
section.docx {
  display: block;
  box-sizing: border-box;
  margin: 0;
  position: relative;
  overflow: visible;
}
section.docx > header,
section.docx > footer {
  display: block;
  margin: 0;
  min-height: 0;
}
section.docx > article {
  margin: 0;
}
`;

function parseLength(value: string | null | undefined): number | null {
  if (!value) return null;

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(pt|px|in)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  if (match[2] === 'in') return amount * 72;
  if (match[2] === 'px') return amount * 0.75;
  return amount;
}

function pxToPt(value: string): number {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount * 0.75 : 0;
}

function detectPageSize(width: number, height: number): WordPageSize {
  const match = (Object.entries(PAGE_SIZES) as [WordPageSize, { width: number; height: number }][]).find(
    ([, size]) => Math.abs(size.width - width) < 2 && Math.abs(size.height - height) < 2
  );

  return match?.[0] ?? 'a4';
}

function stripWatermarks(root: HTMLElement): void {
  for (const svg of root.querySelectorAll<SVGElement>('svg')) {
    const style = svg.getAttribute('style') ?? '';
    if (!/z-index\s*:\s*-\d+/i.test(style)) continue;

    const parent = svg.parentElement;
    svg.remove();

    if (parent && parent.childElementCount === 0 && !parent.textContent?.trim()) {
      parent.remove();
    }
  }
}

function listLevel(element: HTMLElement): number {
  if (
    element.classList.contains('docx_list3') ||
    element.classList.contains('docx_listbullet3') ||
    element.classList.contains('docx_listnumber3')
  ) {
    return 54;
  }

  if (
    element.classList.contains('docx_list2') ||
    element.classList.contains('docx_listbullet2') ||
    element.classList.contains('docx_listnumber2')
  ) {
    return 36;
  }

  return 18;
}

function normalizeLists(root: HTMLElement): void {
  const counters = new Map<string, number>();
  const items = root.querySelectorAll<HTMLParagraphElement>(
    'p.docx_list, p.docx_list2, p.docx_list3, ' +
      'p.docx_listbullet, p.docx_listbullet2, p.docx_listbullet3, ' +
      'p.docx_listnumber, p.docx_listnumber2, p.docx_listnumber3'
  );

  for (const item of items) {
    const numberClass = Array.from(item.classList).find((name) => name.startsWith('docx-num-'));
    const isBullet =
      item.classList.contains('docx_listbullet') ||
      item.classList.contains('docx_listbullet2') ||
      item.classList.contains('docx_listbullet3');

    let marker = '';
    if (isBullet) {
      marker = '•';
    } else if (numberClass) {
      const next = (counters.get(numberClass) ?? 0) + 1;
      counters.set(numberClass, next);
      marker = `${next}.`;
    }

    if (marker) {
      item.insertAdjacentText('afterbegin', `${marker} `);
    }

    for (const className of Array.from(item.classList)) {
      if (className.startsWith('docx-num-')) item.classList.remove(className);
    }

    item.style.display = 'block';
    item.style.listStyle = 'none';
    item.style.textIndent = '0';
    item.style.marginLeft = `${listLevel(item)}pt`;
  }
}

interface NormalizedSection {
  element: HTMLElement;
  pageSize: WordPageSize;
  paddingBottom: number;
  footerText: string;
}

function normalizePages(root: HTMLElement): NormalizedSection[] {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('section.docx'));
  const normalized: NormalizedSection[] = [];

  for (const section of sections) {
    const computed = getComputedStyle(section);
    const width =
      parseLength(section.style.width) ??
      parseLength(computed.width) ??
      PAGE_SIZES.a4.width;
    const height =
      parseLength(section.style.minHeight) ??
      parseLength(section.style.height) ??
      parseLength(computed.minHeight) ??
      parseLength(computed.height) ??
      PAGE_SIZES.a4.height;
    const pageSize = detectPageSize(width, height);
    const page = PAGE_SIZES[pageSize];
    const paddingTop = pxToPt(computed.paddingTop);
    const paddingRight = pxToPt(computed.paddingRight);
    const paddingBottom = pxToPt(computed.paddingBottom);
    const paddingLeft = pxToPt(computed.paddingLeft);
    const contentWidth = Math.max(1, page.width - paddingLeft - paddingRight);
    const contentHeight = Math.max(1, page.height - paddingTop - paddingBottom);

    Object.assign(section.style, {
      display: 'block',
      boxSizing: 'content-box',
      margin: '0',
      width: `${contentWidth}pt`,
      height: `${contentHeight}pt`,
      minHeight: `${contentHeight}pt`,
      padding: `${paddingTop}pt ${paddingRight}pt ${paddingBottom}pt ${paddingLeft}pt`,
      position: 'static',
      overflow: 'visible'
    });

    const header = section.querySelector<HTMLElement>(':scope > header');
    const article = section.querySelector<HTMLElement>(':scope > article');
    const footer = section.querySelector<HTMLElement>(':scope > footer');

    if (header) {
      Object.assign(header.style, {
        display: 'block',
        margin: '0',
        minHeight: '0'
      });
    }

    if (article) {
      article.style.margin = '0';
    }

    if (footer) {
      Object.assign(footer.style, {
        display: 'block',
        width: 'auto',
        margin: '0',
        minHeight: '0'
      });
      footer.style.setProperty('--pw-footer-margin', '0.0001pt');
    }

    normalized.push({
      element: section,
      pageSize,
      paddingBottom,
      footerText: footer?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? ''
    });
  }

  return normalized;
}

async function assertDocx(file: File): Promise<void> {
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new DocxRenderError('DOCX_CORRUPT', 'El archivo no es un .docx válido.');
  }
}

export async function renderDocxToPages(file: File, maxPages: number): Promise<RenderedDocx> {
  await assertDocx(file);
  const prepared = await prepareDocxPageFields(file);

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:fixed;left:-10000px;top:0;width:595pt;visibility:hidden;pointer-events:none;';

  const body = document.createElement('div');
  const styles = document.createElement('div');
  wrapper.append(styles, body);
  document.body.append(wrapper);

  try {
    await renderAsync(prepared, body, styles, {
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      inWrapper: false
    });

    stripWatermarks(body);
    normalizeLists(body);
    const sections = normalizePages(body);

    if (sections.length === 0) {
      throw new DocxRenderError('DOCX_CORRUPT', 'El Word no contiene páginas legibles.');
    }

    if (sections.length > maxPages) {
      throw new DocxRenderError(
        'DOCX_TOO_MANY_PAGES',
        `El Word tiene ${sections.length} páginas y el máximo es ${maxPages}.`
      );
    }

    const totalPages = sections.length;
    for (const [index, section] of sections.entries()) {
      replacePagePlaceholders(section.element, index + 1, totalPages);
      const footer = section.element.querySelector<HTMLElement>(':scope > footer');
      section.footerText =
        footer?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '';
    }

    return {
      css: styles.innerHTML + `<style>${PAGE_CSS}</style>`,
      pages: sections.map(({ element, pageSize, paddingBottom, footerText }) => ({
        html: element.outerHTML,
        pageSize,
        paddingBottom,
        footerText
      }))
    };
  } catch (error: unknown) {
    if (error instanceof DocxRenderError) throw error;

    throw new DocxRenderError(
      'DOCX_CORRUPT',
      error instanceof Error ? error.message : 'No se pudo leer el Word.'
    );
  } finally {
    wrapper.remove();
  }
}
