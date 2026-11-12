export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 || value >= 10 ? 0 : 1;
  const formatted = value.toFixed(digits).replace(/\.0$/, '');

  return `${formatted} ${units[exponent]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 s';
  if (ms < 1000) return `${Math.round(ms)} ms`;

  return `${new Intl.NumberFormat('es', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0
  }).format(ms / 1000)} s`;
}
