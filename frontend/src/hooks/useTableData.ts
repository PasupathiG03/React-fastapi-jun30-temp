import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Client-side search + pagination for any list.
 * `searchText` returns the text of a row that the search box should match against.
 */
export function useTableData<T>(items: T[], searchText: (item: T) => string, initialPageSize = 10) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => searchText(item).toLowerCase().includes(q)) : items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Keep the page valid when the search, page size or data changes.
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  return {
    query,
    setQuery: (q: string) => {
      setQuery(q);
      setPage(1);
    },
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    totalPages,
    filtered,
    paged,
    total: items.length,
  };
}
