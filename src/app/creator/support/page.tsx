import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import SupportClient from './support-client'

export default async function CreatorSupportPage() {
  await requireCreatorPageAccess('support')
  return <SupportClient />
}
