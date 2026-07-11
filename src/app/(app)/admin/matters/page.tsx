// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const LAW_TYPES = ['Corporate','Litigation','Employment','Real Estate','Intellectual Property','Tax','Family','Criminal','Immigration','Other']
const STATUS_OPTIONS = ['active','inactive','completed']
const RATE_TYPES = ['A','B','C','D','E']
const RATE_LABELS = { A: 'Standard', B: 'Negotiated', C: 'Retainer', D: 'Government', E: 'Pro Bono' }

export default function NewMatterPage() {
  const router = useRouter()

  // Client selection
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [showNewClient, setShowNewClient] = useState(false)
  const [searching, setSearching] = useState(false)

  // New client fields
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientCompany, setNewClientCompany] = useState('')
  const [newClientAddress, setNewClientAddress] = useState('')
  const [newClientCurrency, setNewClientCurrency] = useState('NGN')

  // Matter fields
  const [matterId, setMatterId] = useState('')
  const [caseName, setCaseName] = useState('')
  const [description, setDescription] = useState('')
  const [lawType, setLawType] = useState('')
  const [introducingLawyer, setIntroducingLawyer] = useState('')
  const [billingName, setBillingName] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [billingCurrency, setBillingCurrency] = useState('NGN')
  const [responsibleLawyer, setResponsibleLawyer] = useState('')
  const [assignedLawyer, setAssignedLawyer] = useState('')
  const [openDate, setOpenDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('active')
  const [rateType, setRateType] = useState('A')
  const [associateRate, setAssociateRate] = useState(250)
  const [seniorRate, setSeniorRate] = useState(350)
  const [partnerRate, setPartnerRate] = useState(550)
  const [bAssocRate, setBAssocRate] = useState(180)
  const [bSeniorRate, setBSeniorRate] = useState(280)
  const [bPartnerRate, setBPartnerRate] = useState(400)
  const [lawyers, setLawyers] = useState([{ user_id: '', rate_tier: 'associate' }])
  const [users, setUsers] = useState([])
  const [exchangeRate, setExchangeRate] = useState(1600)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const searchTimeout = useRef(null)

  useEffect(() => {
    fetch('/api/admin/clients/detail?type=users').then(r => r.json()).then(d => setUsers(d.users || []))
    fetch('/api/admin/clients/detail?type=exchange_rate').then(r => r.json()).then(d => {
      if (d.exchange_rate) setExchangeRate(d.exchange_rate.rate)
    })
  }, [])

  const searchClients = (q) => {
    setClientQuery(q)
    setSelectedClient(null)
    if (!q.trim()) { setClientResults([]); return }
    clearTimeout(searchTimeout.current)
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      const r = await fetch('/api/admin/clients/search?q=' + encodeURIComponent(q))
      const d = await r.json()
      setClientResults(d.clients || [])
      setSearching(false)
    }, 300)
  }

  const selectClient = (c) => {
    setSelectedClient(c)
    setClientQuery(c.name)
    setClientResults([])
    setShowNewClient(false)
    // Auto-populate billing fields
    setBillingName(c.name)
    setBillingCurrency(c.billing_currency || 'NGN')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    let clientId = selectedClient?.id

    // Create new client if needed
    if (!clientId && showNewClient && newClientName) {
      const cr = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newClientName,
          email: newClientEmail,
          phone: newClientPhone,
          company: newClientCompany,
          billing_currency: newClientCurrency,
        }),
      })
      const cd = await cr.json()
      if (!cr.ok) { setError(cd.error || 'Failed to create client'); setSubmitting(false); return }
      clientId = cd.client.id
    }

    if (!clientId) { setError('Please select or create a client'); setSubmitting(false); return }

    const mr = await fetch('/api/admin/matters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        matter_id: matterId || undefined,
        case_name: caseName,
        description, law_type: lawType,
        introducing_lawyer: introducingLawyer,
        billing_name: billingName || (selectedClient?.name) || newClientName,
        billing_address: billingAddress,
        business_phone: businessPhone,
        billing_currency: billingCurrency,
        associate_rate: associateRate,
        senior_associate_rate: seniorRate,
        partner_rate: partnerRate,
        rate_type: rateType,
        b_associate_rate: bAssocRate,
        b_senior_associate_rate: bSeniorRate,
        b_partner_rate: bPartnerRate,
        responsible_lawyer: responsibleLawyer || null,
        assigned_lawyer: assignedLawyer || null,
        open_date: openDate, status,
        lawyers: lawyers.filter(l => l.user_id),
      }),
    })

    const md = await mr.json()
    if (!mr.ok) { setError(md.error || 'Failed to create matter'); setSubmitting(false); return }

    router.push('/admin/clients/' + clientId)
  }

  const addLawyer = () => setLawyers([...lawyers, { user_id: '', rate_tier: 'associate' }])
  const removeLawyer = (i) => setLawyers(lawyers.filter((_, idx) => idx !== i))
  const updateLawyer = (i, f, v) => { const u = [...lawyers]; u[i] = { ...u[i], [f]: v }; setLawyers(u) }

  const getRateVal = (role) => {
    const rates = {
      A: { associate: associateRate, senior_associate: seniorRate, partner: partnerRate },
      B: { associate: bAssocRate, senior_associate: bSeniorRate, partner: bPartnerRate },
    }
    return rates[rateType]?.[role] || (rateType === 'A' ? (role === 'associate' ? 250 : role === 'senior_associate' ? 350 : 550) : 0)
  }

  return (
    <div className='p-8 max-w-4xl'>
      <h1 className='text-2xl font-bold text-gray-900 mb-1'>New Matter</h1>
      <p className='text-gray-600 mb-6'>Open a new matter. Search for an existing client or create one inline.</p>

      {error && <div className='bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600'>{error}</div>}

      <form onSubmit={handleSubmit} className='space-y-6'>

        <div className='bg-white border border-gray-200 rounded-lg p-5'>
          <h2 className='font-semibold text-gray-900 mb-3'>Client</h2>
          <div className='relative'>
            <input type='text' placeholder='Search client by name, company or email...'
              value={clientQuery} onChange={e => searchClients(e.target.value)}
              className='w-full px-3 py-2 border rounded-md text-sm' />
            {searching && <p className='text-xs text-gray-400 mt-1'>Searching...</p>}
            {clientResults.length > 0 && (
              <div className='absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1'>
                {clientResults.map(c => (
                  <button key={c.id} type='button' onClick={() => selectClient(c)}
                    className='w-full text-left px-4 py-2 hover:bg-gray-50 text-sm'>
                    <p className='font-medium text-gray-900'>{c.name}</p>
                    <p className='text-xs text-gray-500'>{[c.company, c.email].filter(Boolean).join(' · ')} · {c.billing_currency}</p>
                  </button>
                ))}
                <button type='button' onClick={() => { setShowNewClient(true); setClientResults([]); setSelectedClient(null) }}
                  className='w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100'>
                  + Create new client: "{clientQuery}"
                </button>
              </div>
            )}
            {clientQuery && clientResults.length === 0 && !searching && !selectedClient && !showNewClient && (
              <button type='button' onClick={() => setShowNewClient(true)}
                className='mt-1 text-xs text-blue-600 hover:underline'>
                No clients found. Create "{clientQuery}" as a new client?
              </button>
            )}
          </div>

          {selectedClient && (
            <div className='mt-2 flex items-center gap-2'>
              <span className='text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded'>
                Selected: {selectedClient.name} · {selectedClient.billing_currency}
              </span>
              <button type='button' onClick={() => { setSelectedClient(null); setClientQuery('') }} className='text-xs text-gray-400 hover:text-gray-600'>✕</button>
            </div>
          )}

          {showNewClient && (
            <div className='mt-3 border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3'>
              <p className='text-xs font-medium text-blue-700'>New Client Details</p>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <input type='text' required placeholder='Client name *' value={newClientName || clientQuery}
                  onChange={e => setNewClientName(e.target.value)} className='px-3 py-2 border rounded-md text-sm bg-white' />
                <input type='text' placeholder='Company' value={newClientCompany}
                  onChange={e => setNewClientCompany(e.target.value)} className='px-3 py-2 border rounded-md text-sm bg-white' />
                <input type='email' placeholder='Email' value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)} className='px-3 py-2 border rounded-md text-sm bg-white' />
                <input type='text' placeholder='Phone' value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)} className='px-3 py-2 border rounded-md text-sm bg-white' />
                <select value={newClientCurrency} onChange={e => setNewClientCurrency(e.target.value)} className='px-3 py-2 border rounded-md text-sm bg-white'>
                  <option value='NGN'>NGN (Nigerian Naira)</option>
                  <option value='USD'>USD (US Dollar)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className='bg-white border border-gray-200 rounded-lg p-5'>
          <h2 className='font-semibold text-gray-900 mb-3'>Matter Details</h2>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Matter ID (auto-generated if empty)</label>
              <input type='text' placeholder='e.g. 26-001-001' value={matterId} onChange={e => setMatterId(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Case Name / Matter Name *</label>
              <input type='text' required value={caseName} onChange={e => setCaseName(e.target.value)} placeholder='e.g. Zenith Bank v. Acme Ltd' className='w-full px-3 py-2 border rounded-md text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Law Type</label>
              <select value={lawType} onChange={e => setLawType(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm'>
                <option value=''>Select...</option>
                {LAW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm'>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Open Date</label>
              <input type='date' value={openDate} onChange={e => setOpenDate(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Billing Currency</label>
              <select value={billingCurrency} onChange={e => setBillingCurrency(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm'>
                <option value='NGN'>NGN (Nigerian Naira)</option>
                <option value='USD'>USD (US Dollar)</option>
              </select>
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Business Phone</label>
              <input type='text' value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Introducing Lawyer</label>
              <input type='text' value={introducingLawyer} onChange={e => setIntroducingLawyer(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Billing Name</label>
              <input type='text' value={billingName} onChange={e => setBillingName(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Responsible Lawyer</label>
              <select value={responsibleLawyer} onChange={e => setResponsibleLawyer(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm'>
                <option value=''>Select user...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
              </select>
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Assigned Lawyer</label>
              <select value={assignedLawyer} onChange={e => setAssignedLawyer(e.target.value)} className='w-full px-3 py-2 border rounded-md text-sm'>
                <option value=''>Select user...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
              </select>
            </div>
          </div>
          <div className='mt-3'>
            <label className='text-xs text-gray-500 block mb-1'>Billing Address</label>
            <textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)} rows={2} className='w-full px-3 py-2 border rounded-md text-sm' />
          </div>
          <div className='mt-3'>
            <label className='text-xs text-gray-500 block mb-1'>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className='w-full px-3 py-2 border rounded-md text-sm' />
          </div>
        </div>

        <div className='bg-white border border-gray-200 rounded-lg p-5'>
          <h2 className='font-semibold text-gray-900 mb-3'>Rate Type</h2>
          <div className='flex gap-2 mb-4'>
            {RATE_TYPES.map(r => (
              <button key={r} type='button' onClick={() => setRateType(r)}
                className={'px-4 py-2 rounded-md text-sm font-medium border ' + (rateType === r ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300')}>
                Rate {r} <span className='text-xs opacity-70'>({RATE_LABELS[r]})</span>
              </button>
            ))}
          </div>
          <div className='grid grid-cols-3 gap-4'>
            {[
              { label: 'Associate', role: 'associate', aVal: associateRate, setA: setAssociateRate, bVal: bAssocRate, setB: setBAssocRate },
              { label: 'Senior Associate', role: 'senior_associate', aVal: seniorRate, setA: setSeniorRate, bVal: bSeniorRate, setB: setBSeniorRate },
              { label: 'Partner', role: 'partner', aVal: partnerRate, setA: setPartnerRate, bVal: bPartnerRate, setB: setBPartnerRate },
            ].map(({ label, aVal, setA, bVal, setB }) => {
              const isA = rateType === 'A'
              const val = isA ? aVal : bVal
              const setVal = isA ? setA : setB
              return (
                <div key={label}>
                  <label className='text-xs text-gray-500 block mb-1'>{label}</label>
                  <div className='relative'>
                    <span className='absolute left-3 top-2 text-sm text-gray-400'>$</span>
                    <input type='number' value={val}
                      readOnly={isA}
                      onChange={e => !isA && setVal(parseFloat(e.target.value))}
                      className={'w-full pl-6 pr-3 py-2 border rounded-md text-sm ' + (isA ? 'bg-gray-50 text-gray-500' : 'bg-white')} />
                  </div>
                  <p className='text-xs text-gray-400 mt-0.5'>₦{(val * exchangeRate).toLocaleString()}/hr</p>
                </div>
              )
            })}
          </div>
          {rateType !== 'A' && (
            <p className='text-xs text-amber-600 mt-3'>Rate {rateType} ({RATE_LABELS[rateType]}) is a negotiated rate. Ensure this has been approved before saving.</p>
          )}
        </div>

        <div className='bg-white border border-gray-200 rounded-lg p-5'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='font-semibold text-gray-900'>Lawyer Assignments</h2>
            <button type='button' onClick={addLawyer} className='text-xs text-blue-600 hover:underline'>+ Add lawyer</button>
          </div>
          <div className='space-y-2'>
            {lawyers.map((l, i) => (
              <div key={i} className='flex items-center gap-2'>
                <select value={l.user_id} onChange={e => updateLawyer(i, 'user_id', e.target.value)} className='flex-1 px-3 py-2 border rounded-md text-sm'>
                  <option value=''>Select lawyer...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <select value={l.rate_tier} onChange={e => updateLawyer(i, 'rate_tier', e.target.value)} className='px-3 py-2 border rounded-md text-sm'>
                  <option value='associate'>Associate (${getRateVal('associate')}/hr)</option>
                  <option value='senior_associate'>Senior Associate (${getRateVal('senior_associate')}/hr)</option>
                  <option value='partner'>Partner (${getRateVal('partner')}/hr)</option>
                </select>
                {lawyers.length > 1 && (
                  <button type='button' onClick={() => removeLawyer(i)} className='text-red-500 text-xs hover:underline'>Remove</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button type='submit' disabled={submitting} className='w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50'>
          {submitting ? 'Creating...' : 'Create matter'}
        </button>
      </form>
    </div>
  )
}