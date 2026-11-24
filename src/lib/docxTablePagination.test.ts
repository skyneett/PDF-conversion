import { describe, expect, it } from 'vitest';
import { splitTallTables } from './docxTablePagination';

describe('docxTablePagination', () => {
  it('exporta la función splitTallTables correctamente', () => {
    expect(typeof splitTallTables).toBe('function');
  });
});
