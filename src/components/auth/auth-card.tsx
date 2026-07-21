import Logo from '@/components/brand/logo'

export default function AuthCard({
  children,
  tagline = false,
  wide = false,
}: {
  children: React.ReactNode
  tagline?: boolean
  wide?: boolean
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-8 bg-white rounded-lg shadow`}>
        <div className="flex justify-center mb-6">
          <Logo tagline={tagline} />
        </div>
        {children}
      </div>
    </div>
  )
}
