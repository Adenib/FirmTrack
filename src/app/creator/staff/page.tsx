import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import StaffClient from './staff-client'

export default async function CreatorStaffPage() {
  const { admin } = await requireCreatorPageAccess('staff')
  return <StaffClient currentAdminId={admin.id} />
}
