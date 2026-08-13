import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import PricingClient from './pricing-client'

export default async function CreatorPricingPage() {
  await requireCreatorPageAccess('pricing')
  return <PricingClient />
}
