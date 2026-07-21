const SIZES = {
  sm: { icon: 28, text: 'text-lg' },
  md: { icon: 40, text: 'text-2xl' },
  lg: { icon: 56, text: 'text-3xl' },
} as const

export default function Logo({
  size = 'md',
  tagline = false,
  className = '',
}: {
  size?: keyof typeof SIZES
  tagline?: boolean
  className?: string
}) {
  const { icon, text } = SIZES[size]
  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, not worth next/image's overhead here */}
        <img src="/brand/icon-mark.png" alt="" width={icon} height={icon} className="rounded-md" />
        <span className={`font-bold ${text} leading-none`}>
          <span className="text-brand-navy">Firm</span>
          <span className="text-brand-blue">Track</span>
        </span>
      </div>
      {tagline && (
        <p className="text-xs text-gray-500 mt-1.5 whitespace-nowrap">
          Track Performance, <span className="text-brand-blue">Grow your firm</span>
        </p>
      )}
    </div>
  )
}
