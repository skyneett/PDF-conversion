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

function contentHeight(section: HTMLElement): number {
  const declared = parseLength(section.style.height) ?? parseLength(section.style.minHeight);
  if (declared) return declared;

  const computed = getComputedStyle(section);
  const height = parseLength(computed.height) ?? 0;
  return Math.max(
    1,
    height - pxToPt(computed.paddingTop) - pxToPt(computed.paddingBottom)
  );
}

function outerHeight(element: Element): number {
  if (!(element instanceof HTMLElement)) return 0;
  const style = getComputedStyle(element);
  return (
    element.getBoundingClientRect().height +
    (Number.parseFloat(style.marginTop) || 0) +
    (Number.parseFloat(style.marginBottom) || 0)
  );
}

function isHeaderRow(row: HTMLTableRowElement): boolean {
  const cells = Array.from(row.cells);
  if (cells.length === 0) return false;

  const bold = cells.filter((cell) => {
    if (cell.querySelector('strong, b')) return true;
    return Number.parseInt(getComputedStyle(cell).fontWeight, 10) >= 600;
  }).length;

  const shaded = cells.filter((cell) => {
    const background = getComputedStyle(cell).backgroundColor;
    return (
      background !== '' &&
      background !== 'transparent' &&
      background !== 'rgba(0, 0, 0, 0)'
    );
  }).length;

  return bold === cells.length || shaded === cells.length;
}

function cloneTable(
  table: HTMLTableElement,
  header: HTMLTableRowElement,
  rows: HTMLTableRowElement[]
): HTMLTableElement {
  const clone = table.cloneNode(false) as HTMLTableElement;
  const colgroup = table.querySelector(':scope > colgroup');
  if (colgroup) clone.append(colgroup.cloneNode(true));
  clone.append(header.cloneNode(true));
  for (const row of rows) clone.append(row.cloneNode(true));
  return clone;
}

interface TablePage {
  rows: HTMLTableRowElement[];
  hasPre: boolean;
  hasPost: boolean;
}

function splitSection(section: HTMLElement): HTMLElement[] | null {
  const article = section.querySelector<HTMLElement>(':scope > article');
  if (!article) return null;

  const tables = Array.from(article.querySelectorAll<HTMLTableElement>('table'));
  if (tables.length !== 1) return null;

  const table = tables[0];
  if (table.parentElement !== article || table.rows.length < 3) return null;

  const header = table.rows[0];
  if (!isHeaderRow(header)) return null;

  const available = contentHeight(section);
  if (!Number.isFinite(available) || available <= 0) return null;

  const children = Array.from(article.children);
  const tableIndex = children.indexOf(table);
  if (tableIndex < 0) return null;

  const pre = children.slice(0, tableIndex);
  const post = children.slice(tableIndex + 1);
  const preHeight = pre.reduce((sum, child) => sum + outerHeight(child), 0);
  const postHeight = post.reduce((sum, child) => sum + outerHeight(child), 0);
  const tableHeight = outerHeight(table);

  if (preHeight + tableHeight + postHeight <= available + 0.5) return null;

  const headerHeight = header.getBoundingClientRect().height;
  const dataRows = Array.from(table.rows).slice(1);
  const pages: TablePage[] = [];
  let current: TablePage = { rows: [], hasPre: true, hasPost: false };
  let usedHeight = 0;
  let capacity = available - preHeight - headerHeight;

  for (const row of dataRows) {
    const rowHeight = row.getBoundingClientRect().height;

    if (current.rows.length > 0 && usedHeight + rowHeight > capacity + 0.5) {
      pages.push(current);
      current = { rows: [], hasPre: false, hasPost: false };
      usedHeight = 0;
      capacity = available - headerHeight;
    }

    current.rows.push(row);
    usedHeight += rowHeight;
  }

  if (current.rows.length > 0 || pages.length === 0) pages.push(current);

  if (postHeight > 0) {
    const last = pages[pages.length - 1];
    const remaining = available - headerHeight - usedHeight;
    if (postHeight <= remaining + 0.5) {
      last.hasPost = true;
    } else {
      pages.push({ rows: [], hasPre: false, hasPost: true });
    }
  }

  const headerElement = section.querySelector<HTMLElement>(':scope > header');
  const footerElement = section.querySelector<HTMLElement>(':scope > footer');
  const sections: HTMLElement[] = [];

  for (const page of pages) {
    const clone = section.cloneNode(false) as HTMLElement;
    if (headerElement) clone.append(headerElement.cloneNode(true));

    const pageArticle = document.createElement('article');
    pageArticle.style.margin = '0';

    if (page.hasPre) {
      for (const child of pre) pageArticle.append(child.cloneNode(true));
    }
    if (page.rows.length > 0) {
      pageArticle.append(cloneTable(table, header, page.rows));
    }
    if (page.hasPost) {
      for (const child of post) pageArticle.append(child.cloneNode(true));
    }

    clone.append(pageArticle);
    if (footerElement) clone.append(footerElement.cloneNode(true));
    sections.push(clone);
  }

  return sections;
}

export function splitTallTables(root: HTMLElement): void {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('section.docx'));

  for (const section of sections) {
    const replacement = splitSection(section);
    if (!replacement || replacement.length <= 1) continue;
    section.replaceWith(...replacement);
  }
}
