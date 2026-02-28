export function buildPageHref(params: {
  pathname: string;
  page: number;
  query?: Record<string, string | number | undefined>;
}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  if (params.page > 1) {
    search.set('page', String(params.page));
  } else {
    search.delete('page');
  }

  const queryString = search.toString();
  return queryString ? `${params.pathname}?${queryString}` : params.pathname;
}
