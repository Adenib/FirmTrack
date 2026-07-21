import Link from 'next/link'
import { ClockIcon, MapPinIcon, ChecklistIcon, ChartBarIcon } from '@/components/brand/icons'

const SECTIONS = [
  { href: '/hrtrack/attendance', icon: ClockIcon, label: 'Attendance', description: 'Clock in/out, location, and attendance log.' },
  { href: '/hrtrack/movement', icon: MapPinIcon, label: 'Movement', description: 'Log and approve staff out-of-office movements.' },
  { href: '/hrtrack/performance', icon: ChecklistIcon, label: 'Performance', description: 'Tasks and performance tracking.' },
  { href: '/hrtrack/reports', icon: ChartBarIcon, label: 'Reports', description: 'Attendance summaries across the firm.' },
]

export default function HRTrackHubPage() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">HRTrack</h1>
      <p className="text-gray-600 mb-6">Attendance, movement, and performance in one place.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="w-5 h-5 text-gray-600" />
              <p className="font-semibold text-gray-900">{s.label}</p>
            </div>
            <p className="text-sm text-gray-500">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
