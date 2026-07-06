import { supabase } from './supabase'

type Batch = {
  id: string
  product_id: string
  purchase_item_id?: string | null
  remaining_qty: number
  received_qty?: number
  dp_price: number
  received_date: string
  created_at: string
}

type CostLayer = {
  sale_item_id: string
  qty: number
  cost_amount: number
}

type RebuildBatch = {
  id: string | null
  product_id: string
  purchase_item_id?: string | null
  received_qty: number
  remaining_qty: number
  dp_price: number
  received_date: string
  created_at: string
}

function isMissingFifoTable(error: any) {
  const message = String(error?.message || '')
  return message.includes('inventory_batches') || message.includes('sale_item_cost_layers')
}

async function updateSaleItemAverageCost(saleItemId: string) {
  const { data: layers, error } = await supabase
    .from('sale_item_cost_layers')
    .select('qty, cost_amount')
    .eq('sale_item_id', saleItemId)

  if (error) {
    if (isMissingFifoTable(error)) return
    throw error
  }

  const qty = (layers || []).reduce((sum: number, layer: any) => sum + Number(layer.qty || 0), 0)
  const cost = (layers || []).reduce((sum: number, layer: any) => sum + Number(layer.cost_amount || 0), 0)
  if (qty <= 0) return

  const { error: updateError } = await supabase
    .from('sale_items')
    .update({ cost_price: cost / qty })
    .eq('id', saleItemId)

  if (updateError) throw updateError
}

export async function createOpeningStockBatch(input: {
  productId: string
  qty: number
  dpPrice: number
  mrpPrice: number
  userId?: string
}) {
  if (!input.productId || Number(input.qty || 0) <= 0) return

  const { error } = await supabase.from('inventory_batches').insert({
    product_id: input.productId,
    source_type: 'opening_stock',
    received_qty: input.qty,
    remaining_qty: input.qty,
    dp_price: input.dpPrice || 0,
    mrp_price: input.mrpPrice || 0,
    received_date: new Date().toISOString().split('T')[0],
    created_by: input.userId,
  })

  if (error && !isMissingFifoTable(error)) throw error
}

export async function createReceiveStockBatch(input: {
  productId: string
  purchaseItemId: string
  purchaseReceiveId?: string
  qty: number
  dpPrice: number
  mrpPrice: number
  receiveDate: string
  userId?: string
}) {
  if (!input.productId || Number(input.qty || 0) <= 0) return

  const { data: batch, error } = await supabase
    .from('inventory_batches')
    .insert({
      product_id: input.productId,
      purchase_item_id: input.purchaseItemId,
      purchase_receive_id: input.purchaseReceiveId || null,
      source_type: 'purchase_receive',
      received_qty: input.qty,
      remaining_qty: input.qty,
      dp_price: input.dpPrice || 0,
      mrp_price: input.mrpPrice || 0,
      received_date: input.receiveDate,
      created_by: input.userId,
    })
    .select()
    .maybeSingle()

  if (error) {
    if (isMissingFifoTable(error)) return
    throw error
  }
  if (batch) await settlePendingPreorderCosts(batch as Batch, input.userId)
}

async function settlePendingPreorderCosts(batch: Batch, userId?: string) {
  let remaining = Number(batch.remaining_qty || 0)
  if (remaining <= 0) return

  const { data: pendingLayers, error } = await supabase
    .from('sale_item_cost_layers')
    .select('id, sale_id, sale_item_id, product_id, qty, dp_price')
    .eq('product_id', batch.product_id)
    .eq('source_type', 'preorder')
    .is('inventory_batch_id', null)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingFifoTable(error)) return
    throw error
  }

  const touchedSaleItems = new Set<string>()
  for (const layer of pendingLayers || []) {
    if (remaining <= 0) break
    const layerQty = Number(layer.qty || 0)
    if (layerQty <= 0) continue

    const takeQty = Math.min(layerQty, remaining)
    if (takeQty === layerQty) {
      const { error: updateError } = await supabase
        .from('sale_item_cost_layers')
        .update({
          inventory_batch_id: batch.id,
          source_type: 'fifo',
          dp_price: batch.dp_price,
          cost_amount: takeQty * Number(batch.dp_price || 0),
        })
        .eq('id', layer.id)
      if (updateError) throw updateError
    } else {
      const { error: shrinkError } = await supabase
        .from('sale_item_cost_layers')
        .update({
          qty: layerQty - takeQty,
          cost_amount: (layerQty - takeQty) * Number(layer.dp_price || 0),
        })
        .eq('id', layer.id)
      if (shrinkError) throw shrinkError

      const { error: insertError } = await supabase.from('sale_item_cost_layers').insert({
        sale_id: layer.sale_id,
        sale_item_id: layer.sale_item_id,
        product_id: batch.product_id,
        inventory_batch_id: batch.id,
        source_type: 'fifo',
        qty: takeQty,
        dp_price: batch.dp_price,
        cost_amount: takeQty * Number(batch.dp_price || 0),
        created_by: userId,
      })
      if (insertError) throw insertError
    }

    touchedSaleItems.add(layer.sale_item_id)
    remaining -= takeQty
  }

  if (remaining !== Number(batch.remaining_qty || 0)) {
    const { error: batchError } = await supabase
      .from('inventory_batches')
      .update({ remaining_qty: remaining })
      .eq('id', batch.id)
    if (batchError) throw batchError

    for (const saleItemId of touchedSaleItems) {
      await updateSaleItemAverageCost(saleItemId)
    }
  }
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
  const qty = Math.max(0, Number(input.qty || 0))
  if (!input.productId || qty <= 0) return Number(input.fallbackCost || 0)

  if (input.replaceExisting !== false) {
    const { error: deleteError } = await supabase
      .from('sale_item_cost_layers')
      .delete()
      .eq('sale_item_id', input.saleItemId)
    if (deleteError && !isMissingFifoTable(deleteError)) throw deleteError
  }

  const { data: batches, error } = await supabase
    .from('inventory_batches')
    .select('id, product_id, remaining_qty, dp_price, received_date, created_at')
    .eq('product_id', input.productId)
    .gt('remaining_qty', 0)
    .order('received_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingFifoTable(error)) return Number(input.fallbackCost || 0)
    throw error
  }

  let remaining = qty
  let totalCost = 0
  const layers: any[] = []

  for (const batch of (batches || []) as Batch[]) {
    if (remaining <= 0) break
    const takeQty = Math.min(Number(batch.remaining_qty || 0), remaining)
    if (takeQty <= 0) continue

    const dpPrice = Number(batch.dp_price || 0)
    layers.push({
      sale_id: input.saleId,
      sale_item_id: input.saleItemId,
      product_id: input.productId,
      inventory_batch_id: batch.id,
      source_type: 'fifo',
      qty: takeQty,
      dp_price: dpPrice,
      cost_amount: takeQty * dpPrice,
      created_by: input.userId,
    })
    totalCost += takeQty * dpPrice
    remaining -= takeQty

    const { error: batchError } = await supabase
      .from('inventory_batches')
      .update({ remaining_qty: Number(batch.remaining_qty || 0) - takeQty })
      .eq('id', batch.id)
    if (batchError) throw batchError
  }

  if (remaining > 0) {
    const dpPrice = Number(input.fallbackCost || 0)
    layers.push({
      sale_id: input.saleId,
      sale_item_id: input.saleItemId,
      product_id: input.productId,
      inventory_batch_id: null,
      source_type: 'preorder',
      qty: remaining,
      dp_price: dpPrice,
      cost_amount: remaining * dpPrice,
      created_by: input.userId,
    })
    totalCost += remaining * dpPrice
  }

  if (layers.length > 0) {
    const { error: layerError } = await supabase.from('sale_item_cost_layers').insert(layers)
    if (layerError) {
      if (isMissingFifoTable(layerError)) return Number(input.fallbackCost || 0)
      throw layerError
    }
  }

  await updateSaleItemAverageCost(input.saleItemId)

  const { data: updatedItem } = await supabase
    .from('sale_items')
    .select('cost_price')
    .eq('id', input.saleItemId)
    .maybeSingle()

  return Number(updatedItem?.cost_price || 0) || (totalCost / qty)
}

export async function setManualCostForSaleItem(input: {
  saleId: string
  saleItemId: string
  productId: string
  qty: number
  unitCost: number
  userId?: string
}) {
  const qty = Math.max(0, Number(input.qty || 0))
  const unitCost = Math.max(0, Number(input.unitCost || 0))
  if (!input.saleItemId || qty <= 0) return unitCost

  const { error: deleteError } = await supabase
    .from('sale_item_cost_layers')
    .delete()
    .eq('sale_item_id', input.saleItemId)
  if (deleteError && !isMissingFifoTable(deleteError)) throw deleteError

  let remaining = qty
  const layers: any[] = []

  if (input.productId) {
    const { data: batches, error } = await supabase
      .from('inventory_batches')
      .select('id, product_id, remaining_qty, dp_price, received_date, created_at')
      .eq('product_id', input.productId)
      .gt('remaining_qty', 0)
      .order('received_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      if (!isMissingFifoTable(error)) throw error
    } else {
      for (const batch of (batches || []) as Batch[]) {
        if (remaining <= 0) break
        const takeQty = Math.min(Number(batch.remaining_qty || 0), remaining)
        if (takeQty <= 0) continue

        layers.push({
          sale_id: input.saleId,
          sale_item_id: input.saleItemId,
          product_id: input.productId,
          inventory_batch_id: batch.id,
          source_type: 'manual',
          qty: takeQty,
          dp_price: unitCost,
          cost_amount: takeQty * unitCost,
          created_by: input.userId,
        })
        remaining -= takeQty

        const { error: batchError } = await supabase
          .from('inventory_batches')
          .update({ remaining_qty: Number(batch.remaining_qty || 0) - takeQty })
          .eq('id', batch.id)
        if (batchError) throw batchError
      }
    }
  }

  if (remaining > 0 || layers.length === 0) {
    layers.push({
      sale_id: input.saleId,
      sale_item_id: input.saleItemId,
      product_id: input.productId || null,
      inventory_batch_id: null,
      source_type: 'manual',
      qty: remaining > 0 ? remaining : qty,
      dp_price: unitCost,
      cost_amount: (remaining > 0 ? remaining : qty) * unitCost,
      created_by: input.userId,
    })
  }

  if (layers.length > 0) {
    const { error: layerError } = await supabase.from('sale_item_cost_layers').insert(layers)
    if (layerError && !isMissingFifoTable(layerError)) throw layerError
  }

  const { error: updateError } = await supabase
    .from('sale_items')
    .update({ cost_price: unitCost })
    .eq('id', input.saleItemId)
  if (updateError) throw updateError

  return unitCost
}

export async function saleItemCostTotal(saleItemId: string, fallbackQty: number, fallbackUnitCost: number) {
  const { data, error } = await supabase
    .from('sale_item_cost_layers')
    .select('cost_amount')
    .eq('sale_item_id', saleItemId)

  if (error || !data?.length) return Number(fallbackQty || 0) * Number(fallbackUnitCost || 0)
  return data.reduce((sum: number, layer: any) => sum + Number(layer.cost_amount || 0), 0)
}

export async function releaseFifoForSaleItem(saleItemId: string) {
  if (!saleItemId) return

  const { data: layers, error } = await supabase
    .from('sale_item_cost_layers')
    .select('id, inventory_batch_id, source_type, qty')
    .eq('sale_item_id', saleItemId)

  if (error) {
    if (isMissingFifoTable(error)) return
    throw error
  }

  for (const layer of layers || []) {
    if (layer.inventory_batch_id && ['fifo', 'manual'].includes(layer.source_type)) {
      const { data: batch, error: batchError } = await supabase
        .from('inventory_batches')
        .select('id, remaining_qty')
        .eq('id', layer.inventory_batch_id)
        .maybeSingle()
      if (batchError) throw batchError
      if (batch) {
        const { error: updateError } = await supabase
          .from('inventory_batches')
          .update({ remaining_qty: Number(batch.remaining_qty || 0) + Number(layer.qty || 0) })
          .eq('id', batch.id)
        if (updateError) throw updateError
      }
    }
  }

  const { error: deleteError } = await supabase
    .from('sale_item_cost_layers')
    .delete()
    .eq('sale_item_id', saleItemId)

  if (deleteError && !isMissingFifoTable(deleteError)) throw deleteError
}

export async function recalculateFifoSaleCosts(userId?: string, options: { skipSaleItemIds?: string[] } = {}) {
  const skipSaleItemIds = new Set(options.skipSaleItemIds || [])
  const { data: batchRows, error: batchError } = await supabase
    .from('inventory_batches')
    .select('id, product_id, purchase_item_id, received_qty, remaining_qty, dp_price, received_date, created_at')
    .order('received_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (batchError) {
    if (isMissingFifoTable(batchError)) return { updatedSaleItems: 0 }
    throw batchError
  }

  const { data: purchaseRows, error: purchaseError } = await supabase
    .from('purchase_items')
    .select('id, product_id, received_qty, qty, actual_dp, dp_price, purchases(date, created_at)')
    .gt('received_qty', 0)

  if (purchaseError && !String(purchaseError.message || '').includes('purchase_items')) {
    throw purchaseError
  }

  const realBatches = ((batchRows || []) as any[])
    .map(row => ({
      id: row.id,
      product_id: row.product_id,
      purchase_item_id: row.purchase_item_id || null,
      received_qty: Number(row.received_qty || 0),
      remaining_qty: Number(row.received_qty || 0),
      dp_price: Number(row.dp_price || 0),
      received_date: row.received_date || row.created_at,
      created_at: row.created_at || row.received_date,
    }))
    .filter(row => row.product_id && row.received_qty > 0)

  const purchaseItemIdsWithBatch = new Set(realBatches.map(row => row.purchase_item_id).filter(Boolean))
  const syntheticPurchaseBatches = ((purchaseRows || []) as any[])
    .filter(row => row.product_id && row.id && !purchaseItemIdsWithBatch.has(row.id))
    .map(row => {
      const purchase = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases
      const qty = Number(row.received_qty || row.qty || 0)
      const dpPrice = Number(row.actual_dp || row.dp_price || 0)
      return {
        id: null,
        product_id: row.product_id,
        purchase_item_id: row.id,
        received_qty: qty,
        remaining_qty: qty,
        dp_price: dpPrice,
        received_date: purchase?.date || purchase?.created_at || new Date().toISOString().split('T')[0],
        created_at: purchase?.created_at || purchase?.date || new Date().toISOString(),
      }
    })
    .filter(row => row.received_qty > 0)

  const batches = [...realBatches, ...syntheticPurchaseBatches].sort((a, b) =>
    new Date(a.received_date || a.created_at || 0).getTime() - new Date(b.received_date || b.created_at || 0).getTime() ||
    String(a.created_at || '').localeCompare(String(b.created_at || ''))
  )

  const batchesByProduct = batches.reduce<Record<string, RebuildBatch[]>>((acc, batch) => {
    acc[batch.product_id] = acc[batch.product_id] || []
    acc[batch.product_id].push(batch)
    return acc
  }, {})

  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select('id, date, created_at, sale_items(id, product_id, qty, cost_price)')
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })

  if (salesError) throw salesError

  const orderedSales = ((sales || []) as any[]).sort((a, b) =>
    new Date(a.date || a.created_at || 0).getTime() - new Date(b.date || b.created_at || 0).getTime() ||
    String(a.created_at || '').localeCompare(String(b.created_at || ''))
  )
  const saleItems = orderedSales.flatMap(sale =>
    (sale.sale_items || []).map((item: any) => ({ ...item, sale_id: sale.id }))
  )
  const saleItemIds = saleItems.map(item => item.id).filter((id: string) => id && !skipSaleItemIds.has(id))

  if (saleItemIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('sale_item_cost_layers')
      .delete()
      .in('sale_item_id', saleItemIds)
    if (deleteError && !isMissingFifoTable(deleteError)) throw deleteError
  }

  let updatedSaleItems = 0
  const newLayers: any[] = []

  for (const item of saleItems) {
    const qty = Number(item.qty || 0)
    if (!item.id || !item.product_id || qty <= 0) continue

    let remaining = qty
    let totalCost = 0
    const productBatches = batchesByProduct[item.product_id] || []
    const shouldSkipCostUpdate = skipSaleItemIds.has(item.id)

    for (const batch of productBatches) {
      if (remaining <= 0) break
      const takeQty = Math.min(batch.remaining_qty, remaining)
      if (takeQty <= 0) continue

      const costAmount = takeQty * Number(batch.dp_price || 0)
      if (!shouldSkipCostUpdate) {
        newLayers.push({
          sale_id: item.sale_id,
          sale_item_id: item.id,
          product_id: item.product_id,
          inventory_batch_id: batch.id,
          source_type: 'fifo',
          qty: takeQty,
          dp_price: Number(batch.dp_price || 0),
          cost_amount: costAmount,
          created_by: userId,
        })
      }
      batch.remaining_qty -= takeQty
      remaining -= takeQty
      totalCost += costAmount
    }

    if (remaining > 0) {
      const fallbackCost = Number(item.cost_price || 0)
      if (!shouldSkipCostUpdate) {
        newLayers.push({
          sale_id: item.sale_id,
          sale_item_id: item.id,
          product_id: item.product_id,
          inventory_batch_id: null,
          source_type: 'preorder',
          qty: remaining,
          dp_price: fallbackCost,
          cost_amount: remaining * fallbackCost,
          created_by: userId,
        })
      }
      totalCost += remaining * fallbackCost
    }

    if (shouldSkipCostUpdate) continue

    const unitCost = totalCost / qty
    const { error: updateError } = await supabase
      .from('sale_items')
      .update({ cost_price: unitCost })
      .eq('id', item.id)
    if (updateError) throw updateError
    updatedSaleItems += 1
  }

  const realBatchUpdates = batches.filter(batch => batch.id)
  for (const batch of realBatchUpdates) {
    const { error: updateError } = await supabase
      .from('inventory_batches')
      .update({ remaining_qty: batch.remaining_qty })
      .eq('id', batch.id)
    if (updateError) throw updateError
  }

  if (newLayers.length > 0) {
    const { error: layerError } = await supabase.from('sale_item_cost_layers').insert(newLayers)
    if (layerError && !isMissingFifoTable(layerError)) throw layerError
  }

  return { updatedSaleItems }
}
