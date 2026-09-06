import React from 'react'
import DraftList from '../../components/DraftList'

export default function DraftPurchaseOrders() {
  return (
    <DraftList
      kind="purchase_order"
      title="Draft Purchase Order"
      subtitle="Orders saved part-way, waiting to be finished"
      nameLabel="Supplier"
      referenceLabel="SI No"
      formPath="/purchase/orders"
    />
  )
}
