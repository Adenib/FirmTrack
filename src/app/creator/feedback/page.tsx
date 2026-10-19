import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import FeedbackClient from './feedback-client'

export default async function CreatorFeedbackPage() {
  await requireCreatorPageAccess('feedback')
  return <FeedbackClient />
}
