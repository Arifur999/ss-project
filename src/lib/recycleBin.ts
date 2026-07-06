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

const STORAGE_KEY = 'furniture_recycle_bin_items'

export function getRecycleItems(type?: RecycleBinType): RecycleBinItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as RecycleBinItem[]
    const sorted = items.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime())
    return type ? sorted.filter(item => item.type === type) : sorted
  } catch {
    return []
  }
}

export function addRecycleItem(item: Omit<RecycleBinItem, 'id' | 'deleted_at'>) {
  const items = getRecycleItems()
  const id = `${item.type}:${item.data?.id || Date.now()}`
  const nextItem: RecycleBinItem = {
    ...item,
    id,
    deleted_at: new Date().toISOString(),
  }
  const nextItems = [nextItem, ...items.filter(existing => existing.id !== id)]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems))
}

export function removeRecycleItem(id: string) {
  const items = getRecycleItems().filter(item => item.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}
