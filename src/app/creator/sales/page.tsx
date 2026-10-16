import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import SalesClient from './sales-client'

export default async function CreatorSalesPage() {
  await requireCreatorPageAccess('sales')
  return <SalesClient />
}
