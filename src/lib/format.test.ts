import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from './format';

describe('formatBytes', () => {
  it('formatea bytes, KB y MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
  });

  it('no rompe con valores inválidos', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('muestra milisegundos para tiempos cortos', () => {
    expect(formatDuration(500)).toBe('500 ms');
  });

  it('muestra segundos con un decimal', () => {
    expect(formatDuration(14_400)).toMatch(/^14[,.]4 s$/);
  });

  it('no añade decimales innecesarios', () => {
    expect(formatDuration(2_000)).toBe('2 s');
  });
});
