import type { Paginated } from "@ss/shared";

export function pageArgs(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paginated<T>(data: T[], total: number, q: { page: number; pageSize: number }): Paginated<T> {
  return { data, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
