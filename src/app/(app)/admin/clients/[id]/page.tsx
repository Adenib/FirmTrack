// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const RATE_TIERS = ['associate', 'senior_associate', 'partner']
const LAW_TYPES = ['Corporate', 'Litigation', 'Debt Recovery', 'Employment', 'Real Estate', 'Intellectual Property', 'Tax', 'Banking & Finance', 'Family', 'Criminal', 'Immigration', 'Other']
const STATUS_OPTIONS = ['active', 'inactive', 'completed']

export default function ClientDetailPage() {
  const params = useParams()
  const clientId = params.id
  
  const [client, setClient] = useState(null)
  const [matters, setMatters] = useState([])
  const [users, setUsers] = useState([])
  const [exchangeRate, setExchangeRate] = useState(1600)
  const [billingCurrency, setBillingCurrency] = useState('NGN')
  const [caseName, setCaseName] = useState('')
  const [associateRate, setAssociateRate] = useState(250)
  const [seniorRate, setSeniorRate] = useState(350)
  const [partnerRate, setPartnerRate] = useState(550)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [matterId, setMatterId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lawType, setLawType] = useState('')
  const [introducingLawyer, setIntroducingLawyer] = useState('')
  const [billingName, setBillingName] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [responsibleLawyer, setResponsibleLawyer] = useState('')
  const [assignedLawyer, setAssignedLawyer] = useState('')
  const [openDate, setOpenDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('active')
  const [lawyers, setLawyers] = useState([{ user_id: '', rate_tier: 'associate' }])
  const [rateType, setRateType] = useState('A')
  const [bAssocRate, setBAssocRate] = useState(180)
  const [bSeniorRate, setBSeniorRate] = useState(280)
  const [bPartnerRate, setBPartnerRate] = useState(400)
  const [cAssocRate, setCAssocRate] = useState(150)
  const [cSeniorRate, setCSeniorRate] = useState(250)
  const [cPartnerRate, setCPartnerRate] = useState(350)
  const [dAssocRate, setDAssocRate] = useState(120)
  const [dSeniorRate, setDSeniorRate] = useState(200)
  const [dPartnerRate, setDPartnerRate] = useState(300)
  const [eAssocRate, setEAssocRate] = useState(0)
  const [eSeniorRate, setESeniorRate] = useState(0)
  const [ePartnerRate, setEPartnerRate] = useState(0)

  // Conflict of interest check — must be run and confirmed before Create
  // matter is enabled (also re-enforced server-side in POST /api/admin/matters).
  const [conflictNames, setConflictNames] = useState([''])
  const [conflictSearching, setConflictSearching] = useState(false)
  const [conflictResults, setConflictResults] = useState(null)
  const [conflictConfirmed, setConflictConfirmed] = useState(false)
  const [conflictError, setConflictError] = useState('')

  const load = async () => {
    if (!clientId) return
    setLoading(true)
    const [cr, mr, ur, er] = await Promise.all([
      fetch('/api/admin/clients/detail?type=client&id=' + clientId).then(r => r.json()),
      fetch('/api/admin/clients/detail?type=matters&id=' + clientId).then(r => r.json()),
      fetch('/api/admin/clients/detail?type=users&id=' + clientId).then(r => r.json()),
      fetch('/api/admin/clients/detail?type=exchange_rate&id=' + clientId).then(r => r.json()),
    ])
    setClient(cr.client)
    setMatters(mr.matters || [])
    setUsers(ur.users || [])
    if (er.exchange_rate) setExchangeRate(er.exchange_rate.rate)
    if (cr.client) setBillingCurrency(cr.client.billing_currency || 'NGN')
    if (cr.client?.name) setConflictNames((prev) => (prev.length === 1 && !prev[0] ? [cr.client.name] : prev))
    setLoading(false)
  }

  const updateConflictName = (i, v) => {
    const next = [...conflictNames]
    next[i] = v
    setConflictNames(next)
    setConflictResults(null)
    setConflictConfirmed(false)
  }
  const addConflictName = () => setConflictNames([...conflictNames, ''])
  const removeConflictName = (i) => {
    setConflictNames(conflictNames.filter((_, idx) => idx !== i))
    setConflictResults(null)
    setConflictConfirmed(false)
  }

  const runConflictSearch = async () => {
    const names = conflictNames.map((n) => n.trim()).filter(Boolean)
    if (names.length === 0) { setConflictError('Enter at least one name to search'); return }
    setConflictSearching(true)
    setConflictError('')
    setConflictConfirmed(false)
    const r = await fetch('/api/admin/conflict-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names }),
    })
    const d = await r.json()
    if (!r.ok) { setConflictError(d.error || 'Search failed'); setConflictSearching(false); return }
    setConflictResults(d.results)
    setConflictSearching(false)
  }

  const conflictMatchCount = conflictResults
    ? conflictResults.clients.length + conflictResults.matters.length + conflictResults.timeEntries.length
    : 0

  useEffect(() => { load() }, [])

  const addLawyer = () => setLawyers([...lawyers, { user_id: '', rate_tier: 'associate' }])
  const removeLawyer = (i) => setLawyers(lawyers.filter((_, idx) => idx !== i))
  const updateLawyer = (i, field, value) => {
    const updated = [...lawyers]
    updated[i] = { ...updated[i], [field]: value }
    setLawyers(updated)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    const response = await fetch('/api/admin/matters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        matter_id: matterId || undefined,
        case_name: title || caseName, description, law_type: lawType,
        introducing_lawyer: introducingLawyer,
        billing_name: billingName,
        billing_address: billingAddress,
        business_phone: businessPhone,
        responsible_lawyer: responsibleLawyer || null,
        assigned_lawyer: assignedLawyer || null,
        open_date: openDate, status,
        rate_type: rateType,
        b_associate_rate: bAssocRate,
        b_senior_associate_rate: bSeniorRate,
        b_partner_rate: bPartnerRate,
        c_associate_rate: cAssocRate,
        c_senior_associate_rate: cSeniorRate,
        c_partner_rate: cPartnerRate,
        d_associate_rate: dAssocRate,
        d_senior_associate_rate: dSeniorRate,
        d_partner_rate: dPartnerRate,
        e_associate_rate: eAssocRate,
        e_senior_associate_rate: eSeniorRate,
        e_partner_rate: ePartnerRate,
        lawyers: lawyers.filter(l => l.user_id),
        conflict_search_terms: conflictNames.map((n) => n.trim()).filter(Boolean),
        conflict_search_confirmed: conflictConfirmed,
        conflict_search_results: conflictResults,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'Failed to create matter')
      setSubmitting(false)
      return
    }

    setSuccess('Matter created: ' + result.matter.matter_id)
    setShowForm(false)
    setMatterId('')
    setTitle('')
    setDescription('')
    setLawType('')
    setIntroducingLawyer('')
    setBillingName('')
    setBillingAddress('')
    setBusinessPhone('')
    setResponsibleLawyer('')
    setAssignedLawyer('')
    setStatus('active')
    setLawyers([{ user_id: '', rate_tier: 'associate' }])
    setConflictNames([client?.name || ''])
    setConflictResults(null)
    setConflictConfirmed(false)
    setSubmitting(false)
    await load()
  }

  const handleStatusChange = async (id, newStatus) => {
    await fetch('/api/admin/matters', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    await load()
  }

  const statusColor = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-amber-100 text-amber-700',
    completed: 'bg-gray-100 text-gray-600',
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>
  if (!client) return <div className="p-8 text-gray-500">Client not found.</div>

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/admin/clients" className="text-sm text-blue-600 hover:underline mb-4 block">
        Back to Clients
      </Link>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {[client.company, client.email, client.phone].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Matters ({matters.length})</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ New Matter'}
        </button>
      </div>

      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-700">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-gray-900">New Matter</h3>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-1">Conflict of Interest Check</h4>
            <p className="text-xs text-gray-500 mb-3">
              Required before this matter can be created. Searches clients, matters, and time entry notes across the firm.
            </p>

            <div className="space-y-2 mb-3">
              {conflictNames.map((n, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Name to check (client, opposing party, related party...)"
                    value={n}
                    onChange={(e) => updateConflictName(i, e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />
                  {conflictNames.length > 1 && (
                    <button type="button" onClick={() => removeConflictName(i)} className="text-red-500 text-xs hover:underline">Remove</button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-3">
              <button type="button" onClick={addConflictName} className="text-xs text-blue-600 hover:underline">+ Add another name</button>
              <button
                type="button"
                onClick={runConflictSearch}
                disabled={conflictSearching}
                className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-50"
              >
                {conflictSearching ? 'Searching...' : 'Run conflict search'}
              </button>
            </div>

            {conflictError && <p className="text-red-600 text-xs mb-2">{conflictError}</p>}

            {conflictResults && (
              <div className="border border-gray-200 rounded-lg p-3">
                {conflictMatchCount === 0 ? (
                  <p className="text-sm text-green-700">No potential conflicts found for: {conflictResults.terms.join(', ')}</p>
                ) : (
                  <>
                    <p className="text-sm text-amber-700 font-medium mb-2">
                      {conflictMatchCount} potential match{conflictMatchCount === 1 ? '' : 'es'} found — review before proceeding:
                    </p>
                    {conflictResults.clients.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-gray-500 uppercase">Clients</p>
                        {conflictResults.clients.map((c) => (
                          <p key={c.id} className="text-sm text-gray-800">{c.name}{c.company ? ` (${c.company})` : ''}</p>
                        ))}
                      </div>
                    )}
                    {conflictResults.matters.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-gray-500 uppercase">Matters</p>
                        {conflictResults.matters.map((m) => (
                          <p key={m.id} className="text-sm text-gray-800">
                            {m.case_name} ({m.matter_id}) — {m.clients?.name} · <span className="capitalize">{m.status}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {conflictResults.timeEntries.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Time entry notes</p>
                        {conflictResults.timeEntries.map((t) => (
                          <p key={t.id} className="text-sm text-gray-800">
                            {t.matters?.case_name} ({t.matters?.matter_id}), {t.entry_date}: {(t.explanation || t.notes || '').slice(0, 120)}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <label className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-sm">
                  <input type="checkbox" checked={conflictConfirmed} onChange={(e) => setConflictConfirmed(e.target.checked)} />
                  I have reviewed these results and confirm there is no conflict of interest.
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Matter ID (auto-generated if empty)</label>
              <input type="text" placeholder="e.g. 26-001-001" value={matterId} onChange={e => setMatterId(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Title *</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Law Type</label>
              <select value={lawType} onChange={e => setLawType(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select...</option>
                {LAW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Open Date</label>
              <input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Business Phone</label>
              <input type="text" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Billing Name</label>
              <input type="text" value={billingName} onChange={e => setBillingName(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Introducing Lawyer</label>
              <input type="text" value={introducingLawyer} onChange={e => setIntroducingLawyer(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Responsible Lawyer</label>
              <select value={responsibleLawyer} onChange={e => setResponsibleLawyer(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select user...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Assigned Lawyer</label>
              <select value={assignedLawyer} onChange={e => setAssignedLawyer(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select user...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Billing Address</label>
            <textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-md text-sm" />
          </div>

          <div className='bg-gray-50 rounded-lg p-4'>
            <div className='flex items-center justify-between mb-3'>
              <p className='text-xs font-medium text-gray-700'>Rate Type</p>
              <div className='flex gap-2'>
                {['A','B','C','D','E'].map(r => (
                  <button key={r} type='button' onClick={() => setRateType(r)}
                    className={'text-xs px-3 py-1 rounded-full border font-medium ' + (rateType === r ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-300')}>
                    Rate {r}
                  </button>
                ))}
              </div>
            </div>
            <div className='grid grid-cols-3 gap-3'>
              {[
                { label: 'Associate', aRate: associateRate, bRate: bAssocRate, setBRate: setBAssocRate, cRate: cAssocRate, setCRate: setCAssocRate, dRate: dAssocRate, setDRate: setDAssocRate, eRate: eAssocRate, setERate: setEAssocRate },
                { label: 'Senior Associate', aRate: seniorRate, bRate: bSeniorRate, setBRate: setBSeniorRate, cRate: cSeniorRate, setCRate: setCSeniorRate, dRate: dSeniorRate, setDRate: setDSeniorRate, eRate: eSeniorRate, setERate: setESeniorRate },
                { label: 'Partner', aRate: partnerRate, bRate: bPartnerRate, setBRate: setBPartnerRate, cRate: cPartnerRate, setCRate: setCPartnerRate, dRate: dPartnerRate, setDRate: setDPartnerRate, eRate: ePartnerRate, setERate: setEPartnerRate },
              ].map(role => {
                const isA = rateType === 'A'
                const currentRate = rateType === 'A' ? role.aRate : rateType === 'B' ? role.bRate : rateType === 'C' ? role.cRate : rateType === 'D' ? role.dRate : role.eRate
                const setCurrentRate = rateType === 'B' ? role.setBRate : rateType === 'C' ? role.setCRate : rateType === 'D' ? role.setDRate : role.setERate
                return (
                  <div key={role.label}>
                    <label className='text-xs text-gray-500 block mb-1'>{role.label}</label>
                    <div className='relative'>
                      <span className='absolute left-3 top-2 text-sm text-gray-400'>$</span>
                      <input type='number' value={currentRate} readOnly={isA}
                        onChange={e => !isA && setCurrentRate(parseFloat(e.target.value))}
                        className={'w-full pl-6 pr-3 py-2 border rounded-md text-sm ' + (isA ? 'bg-gray-100 text-gray-500' : 'bg-white')} />
                    </div>
                    <p className='text-xs text-gray-400 mt-0.5'>₦{(currentRate * exchangeRate).toLocaleString()}/hr</p>
                  </div>
                )
              })}
            </div>
            {rateType !== 'A' && (
              <p className='text-xs text-amber-600 mt-2'>Rate {rateType} is a negotiated rate. Ensure this has been approved before saving.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500">Lawyer Rate Assignments</label>
              <button type="button" onClick={addLawyer} className="text-xs text-blue-600 hover:underline">+ Add lawyer</button>
            </div>
            <div className="space-y-2">
              {lawyers.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={l.user_id} onChange={e => updateLawyer(i, 'user_id', e.target.value)} className="flex-1 px-3 py-2 border rounded-md text-sm">
                    <option value="">Select lawyer...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                  </select>
                  <select value={l.rate_tier} onChange={e => updateLawyer(i, 'rate_tier', e.target.value)} className="px-3 py-2 border rounded-md text-sm">
                    {RATE_TIERS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                  </select>
                  {lawyers.length > 1 && (
                    <button type="button" onClick={() => removeLawyer(i)} className="text-red-500 text-xs hover:underline">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !conflictConfirmed}
            title={!conflictConfirmed ? 'Run and confirm the conflict of interest check above first' : undefined}
            className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : !conflictConfirmed ? 'Complete conflict check to continue' : 'Create matter'}
          </button>
        </form>
      )}

      {matters.length === 0 ? (
        <p className="text-gray-500 text-sm">No matters yet. Click New Matter to add one.</p>
      ) : (
        <div className="space-y-2">
          {matters.map(m => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{m.matter_id}</span>
                  <span className={"text-xs px-2 py-0.5 rounded capitalize " + (statusColor[m.status] || '')}>{m.status}</span>
                </div>
                <p className="font-medium text-gray-900">{m.title}</p>
                <p className="text-xs text-gray-500">{[m.law_type, m.open_date].filter(Boolean).join(' · ')}</p>
              </div>
              <select value={m.status} onChange={e => handleStatusChange(m.id, e.target.value)} className="text-xs px-2 py-1 border rounded-md">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}