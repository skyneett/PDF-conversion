import { MAX_FILENAME_LENGTH } from './constants';

export function sanitizeDownloadName(originalName: string): string {
  const withoutPath = originalName.replace(/\\/g, '/').split('/').pop() ?? '';
  const withoutPdf = withoutPath.replace(/\.pdf$/i, '');
  const cleaned = withoutPdf
    .normalize('NFKC')
    .replace(/[\u0000-\u001F<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();

  return `${cleaned || 'documento'}.docx`;
}
