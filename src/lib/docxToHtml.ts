import { renderAsync } from 'docx-preview';

export interface RenderedDocx {
  css: string;
  pages: string[];
}

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
section.docx {
  display: block;
  box-sizing: border-box;
  width: auto;
  height: 792pt;
  min-height: 792pt;
  padding: 72pt;
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

function normalizePages(root: HTMLElement): HTMLElement[] {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('section.docx'));

  for (const section of sections) {
    Object.assign(section.style, {
      display: 'block',
      boxSizing: 'border-box',
      width: 'auto',
      height: '792pt',
      minHeight: '792pt',
      padding: '72pt',
      position: 'relative',
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
        margin: '0',
        minHeight: '0'
      });
    }

    if (header && article && footer) {
      const sectionStyle = getComputedStyle(section);
      const available =
        section.clientHeight -
        parseFloat(sectionStyle.paddingTop) -
        parseFloat(sectionStyle.paddingBottom) -
        header.getBoundingClientRect().height -
        article.getBoundingClientRect().height -
        footer.getBoundingClientRect().height;

      footer.style.marginTop = `${Math.max(0, (available - 1) * 0.75)}pt`;
    }
  }

  return sections;
}

async function assertDocx(file: File): Promise<void> {
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new DocxRenderError('DOCX_CORRUPT', 'El archivo no es un .docx válido.');
  }
}

export async function renderDocxToPages(file: File, maxPages: number): Promise<RenderedDocx> {
  await assertDocx(file);

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:fixed;left:-10000px;top:0;width:595pt;visibility:hidden;pointer-events:none;';

  const body = document.createElement('div');
  const styles = document.createElement('div');
  wrapper.append(styles, body);
  document.body.append(wrapper);

  try {
    await renderAsync(file, body, styles, {
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      inWrapper: false
    });

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

    return {
      css: styles.innerHTML + `<style>${PAGE_CSS}</style>`,
      pages: sections.map((section) => section.outerHTML)
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
