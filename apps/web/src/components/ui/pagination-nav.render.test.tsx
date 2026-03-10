// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a {...props} href={props.href}>
      {props.children}
    </a>
  ),
}));

import { PaginationNav } from './pagination-nav';

describe('PaginationNav', () => {
  it('renders previous and next navigation links with preserved query params', () => {
    render(
      <PaginationNav
        pathname="/simulations"
        page={2}
        totalPages={4}
        query={{ pageSize: 20, filter: 'active' }}
      />
    );

    expect(screen.getByText('Page 2 of 4')).toBeTruthy();
    expect(screen.getByRole('link', { name: /previous/i }).getAttribute('href')).toBe(
      '/simulations?pageSize=20&filter=active'
    );
    expect(screen.getByRole('link', { name: /next/i }).getAttribute('href')).toBe(
      '/simulations?pageSize=20&filter=active&page=3'
    );
  });
});
