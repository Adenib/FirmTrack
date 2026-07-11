import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type LawyerOption = {
  id: string
  nickname: string
  initials: string
  status: string
  lawyer_rates: { rate_type: string; amount_usd: number }[]
}

export type TaskCodeOption = {
  id: string
  code: string
  description: string | null
}

export function lawyerRateFor(lawyer: LawyerOption | undefined, rateType: string | null) {
  if (!lawyer || !rateType) return null
  const rate = lawyer.lawyer_rates?.find((r) => r.rate_type === rateType)
  return rate ? rate.amount_usd : null
}

export default function useTimetrackLookups() {
  const [lawyers, setLawyers] = useState<LawyerOption[]>([])
  const [taskCodes, setTaskCodes] = useState<TaskCodeOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      const [lawyersRes, taskCodesRes] = await Promise.all([
        supabase
          .from('lawyers')
          .select('id, nickname, initials, status, lawyer_rates(rate_type, amount_usd)')
          .eq('status', 'active')
          .order('nickname'),
        supabase
          .from('task_codes')
          .select('id, code, description')
          .eq('is_active', true)
          .order('code'),
      ])

      setLawyers(lawyersRes.data || [])
      setTaskCodes(taskCodesRes.data || [])
      setLoading(false)
    }

    load()
  }, [])

  return { lawyers, taskCodes, loading }
}
