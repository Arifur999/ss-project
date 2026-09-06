import React from 'react'
import DraftList from '../../components/DraftList'

export default function DraftSales() {
  return (
    <DraftList
      kind="sale"
      title="Draft Sales"
      subtitle="Invoices saved part-way, waiting to be finished"
      nameLabel="Customer"
      referenceLabel="Invoice No"
      formPath="/sales"
    />
  )
}
