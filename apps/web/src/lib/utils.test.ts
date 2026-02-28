import { describe, expect, it } from 'vitest';
import { formatPercent, sanitizePlainText } from './utils';

describe('sanitizePlainText', () => {
  it('removes script tags and angle brackets', () => {
    const input = '<script>alert(1)</script>Hello <b>World</b>';
    expect(sanitizePlainText(input)).toBe('Hello bWorld/b');
  });
});

describe('formatPercent', () => {
  it('formats decimals as percentage', () => {
    expect(formatPercent(0.734)).toBe('73%');
  });
});
