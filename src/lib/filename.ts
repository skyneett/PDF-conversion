import { MAX_FILENAME_LENGTH } from './constants';

export function sanitizeDownloadName(
  originalName: string,
  extension: 'docx' | 'pdf' = 'docx'
): string {
  const withoutPath = originalName.replace(/\\/g, '/').split('/').pop() ?? '';
  const withoutExtension = withoutPath.replace(/\.(pdf|docx)$/i, '');
  const cleaned = withoutExtension
    .normalize('NFKC')
    .replace(/[\u0000-\u001F<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();

  return `${cleaned || 'documento'}.${extension}`;
}
