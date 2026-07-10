// FIFO inventory costing moved to the backend.
//
// The server now runs all FIFO logic inside database transactions:
//  - product create/opening stock  -> POST /products
//  - purchase receive              -> POST /purchases/:id/receive
//  - sale save (consume + layers)  -> POST /sales, PUT /sales/:id
//  - sale delete (release)         -> DELETE /sales/:id
//
// These exports keep the old call sites compiling; they are no-ops because
// the API endpoints already performed the work by the time pages call them.

export async function createOpeningStockBatch(_input: {
  productId: string
  qty: number
  dpPrice: number
  mrpPrice: number
  userId?: string
}) {
  // handled server-side by POST /products
}

export async function createReceiveStockBatch(_input: {
  productId: string
  purchaseItemId: string
  purchaseReceiveId?: string
  qty: number
  dpPrice: number
  mrpPrice: number
  receiveDate: string
  userId?: string
}) {
  // handled server-side by POST /purchases/:id/receive
}

export async function consumeFifoForSaleItem(input: {
  saleId: string
  saleItemId: string
  productId: string
  qty: number
  fallbackCost: number
  userId?: string
  replaceExisting?: boolean
}) {
  // handled server-side by POST /sales - return the fallback for display math
  return Number(input.fallbackCost || 0)
}

export async function setManualCostForSaleItem(input: {
  saleId: string
  saleItemId: string
  productId: string
  qty: number
  unitCost: number
  userId?: string
}) {
  // handled server-side
  return Number(input.unitCost || 0)
}

export async function saleItemCostTotal(_saleItemId: string, fallbackQty: number, fallbackUnitCost: number) {
  return Number(fallbackQty || 0) * Number(fallbackUnitCost || 0)
}

export async function releaseFifoForSaleItem(_saleItemId: string) {
  // handled server-side by DELETE /sales/:id and PUT /sales/:id
}

export async function recalculateFifoSaleCosts(_userId?: string, _options: { skipSaleItemIds?: string[] } = {}) {
  // costing is always consistent server-side now
  return { updatedSaleItems: 0 }
}
