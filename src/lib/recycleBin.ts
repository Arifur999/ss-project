// Recycle bin metadata bridge.
//
// The old app kept deleted-record snapshots in localStorage: pages called
// addRecycleItem({...}) right before deleting the row. The server now stores
// the snapshot itself when a DELETE arrives - this module just holds the
// page-computed display metadata (type/title/subtitle/amount) for a moment so
// the API layer can attach it to the DELETE request body.

export type RecycleBinType = string

export interface RecycleBinItem {
  id: string
  type: RecycleBinType
  title: string
  subtitle: string
  amount: number
  deleted_at: string
  data: any
  table?: string
}

interface PendingMeta {
  type: string
  title?: string
  subtitle?: string
  amount?: number
}

const pendingMeta = new Map<string, PendingMeta>()

export function addRecycleItem(item: Omit<RecycleBinItem, 'id' | 'deleted_at'>) {
  const rowId = item.data?.id
  if (!rowId) return
  pendingMeta.set(String(rowId), {
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    amount: item.amount,
  })
}

// Called by the API layer when it issues the DELETE for a row.
export function consumeRecycleMeta(_table: string, rowId: string): PendingMeta | undefined {
  const meta = pendingMeta.get(String(rowId))
  if (meta) pendingMeta.delete(String(rowId))
  return meta
}

// The RecycleBin page now loads items from the API (see admin.services.ts);
// these remain only so old imports keep compiling.
export function getRecycleItems(_type?: RecycleBinType): RecycleBinItem[] {
  return []
}

export function removeRecycleItem(_id: string) {
  // no-op: permanent deletion goes through the API
}
