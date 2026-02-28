import { describe, expect, it } from 'vitest';
import { buildPageHref } from '../../lib/pagination';

describe('buildPageHref', () => {
  it('keeps additional query params and omits page=1', () => {
    const firstPage = buildPageHref({
      pathname: '/simulations',
      page: 1,
      query: { pageSize: 20, filter: 'active' },
    });

    const secondPage = buildPageHref({
      pathname: '/simulations',
      page: 2,
      query: { pageSize: 20, filter: 'active' },
    });

    expect(firstPage).toBe('/simulations?pageSize=20&filter=active');
    expect(secondPage).toBe('/simulations?pageSize=20&filter=active&page=2');
  });
});
