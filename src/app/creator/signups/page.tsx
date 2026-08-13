import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import SignupsClient from './signups-client'

export default async function CreatorSignupsPage() {
  await requireCreatorPageAccess('signups')
  return <SignupsClient />
}
