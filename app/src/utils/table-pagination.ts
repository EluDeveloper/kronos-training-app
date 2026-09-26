export const TABLE_PAGE_SIZES = [15, 30, 50] as const

export function paginateItems<T>(items: T[], requestedPage = 1, requestedPageSize = 15) {
  const pageSize = TABLE_PAGE_SIZES.includes(requestedPageSize as typeof TABLE_PAGE_SIZES[number]) ? requestedPageSize : 15
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1))
  const start = (page - 1) * pageSize
  const visibleItems = items.slice(start, start + pageSize)

  return { items: visibleItems, page, pageSize, pageCount, from: items.length ? start + 1 : 0, through: items.length ? start + visibleItems.length : 0, total: items.length }
}
