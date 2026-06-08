import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Building2, Pencil, Plus, Trash2, RotateCcw, X } from 'lucide-react'
import { organizationsApi, type OrganizationWritePayload } from '../../api/organizations'
import type { Organization } from '../../types'

type OrgTab = 'ALL' | 'HOSPITAL' | 'DISTRIBUTOR'

const orgFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  registrationNumber: z.string().min(1, 'Registration number is required'),
  type: z.enum(['HOSPITAL', 'DISTRIBUTOR']),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().min(1, 'Pincode is required'),
  country: z.string().min(1, 'Country is required'),
  contactEmail: z.string().email('Valid email required'),
  contactPhone: z.string().min(5, 'Phone is required'),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  active: z.boolean(),
})

type OrgFormValues = z.infer<typeof orgFormSchema>

const emptyDefaults: OrgFormValues = {
  name: '',
  registrationNumber: '',
  type: 'HOSPITAL',
  street: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  contactEmail: '',
  contactPhone: '',
  licenseNumber: '',
  licenseExpiry: '',
  active: true,
}

function orgToFormValues(o: Organization): OrgFormValues {
  const t = o.type === 'VENDOR' ? 'DISTRIBUTOR' : o.type
  return {
    name: o.name,
    registrationNumber: o.registrationNumber,
    type: t === 'HOSPITAL' || t === 'DISTRIBUTOR' ? t : 'DISTRIBUTOR',
    street: o.address?.street ?? '',
    city: o.address?.city ?? '',
    state: o.address?.state ?? '',
    pincode: o.address?.pincode ?? '',
    country: o.address?.country ?? 'India',
    contactEmail: o.contactEmail,
    contactPhone: o.contactPhone,
    licenseNumber: o.licenseNumber ?? '',
    licenseExpiry: o.licenseExpiry ? o.licenseExpiry.slice(0, 10) : '',
    active: o.active,
  }
}

function formToWritePayload(v: OrgFormValues): OrganizationWritePayload {
  return {
    name: v.name.trim(),
    registrationNumber: v.registrationNumber.trim(),
    type: v.type,
    address: {
      street: v.street.trim(),
      city: v.city.trim(),
      state: v.state.trim(),
      pincode: v.pincode.trim(),
      country: v.country.trim(),
    },
    contactEmail: v.contactEmail.trim(),
    contactPhone: v.contactPhone.trim(),
    active: v.active,
    licenseNumber: v.licenseNumber?.trim() || undefined,
    licenseExpiry: v.licenseExpiry?.trim()
      ? new Date(v.licenseExpiry + 'T12:00:00.000Z').toISOString()
      : undefined,
  }
}

const typeBadge: Record<string, string> = {
  HOSPITAL: 'badge-green',
  DISTRIBUTOR: 'badge-blue',
}

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<OrgTab>('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Organization | null>(null)

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['organizations', 'admin', 'list'],
    queryFn: organizationsApi.listAllAdmin,
  })

  const filtered = useMemo(() => {
    const list = [...orgs]
    const byTab = tab === 'ALL' ? list : list.filter(o => o.type === tab)
    return byTab.sort((a, b) => a.name.localeCompare(b.name))
  }, [orgs, tab])

  const form = useForm<OrgFormValues>({
    resolver: zodResolver(orgFormSchema),
    defaultValues: emptyDefaults,
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ ...emptyDefaults, active: true })
    setModalOpen(true)
  }

  const openEdit = (o: Organization) => {
    setEditing(o)
    form.reset(orgToFormValues(o))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
  }

  const createMut = useMutation({
    mutationFn: (body: OrganizationWritePayload) => organizationsApi.create({ ...body, active: true }),
    onSuccess: () => {
      toast.success('Organization created')
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      closeModal()
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d ?? 'Create failed')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Organization }) =>
      organizationsApi.update(id, body),
    onSuccess: () => {
      toast.success('Organization updated')
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      closeModal()
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d ?? 'Update failed')
    },
  })

  const deactivateMut = useMutation({
    mutationFn: organizationsApi.deactivate,
    onSuccess: () => {
      toast.success('Organization deactivated')
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d ?? 'Deactivate failed')
    },
  })

  const onSubmit = (v: OrgFormValues) => {
    const base = formToWritePayload(v)
    if (editing) {
      const body: Organization = {
        id: editing.id,
        ...base,
        createdAt: editing.createdAt,
        updatedAt: editing.updatedAt,
      }
      updateMut.mutate({ id: editing.id, body })
    } else {
      createMut.mutate(base)
    }
  }

  const handleDeactivate = (o: Organization) => {
    if (!window.confirm(`Deactivate "${o.name}"? Users linked to it may lose access until it is reactivated.`)) return
    deactivateMut.mutate(o.id)
  }

  const handleReactivate = (o: Organization) => {
    const body: Organization = {
      ...o,
      active: true,
    }
    updateMut.mutate({ id: o.id, body })
  }

  const busy = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-blue-600" />
            Organizations
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage hospitals, distributors, and org records — view, add, edit, or deactivate.
          </p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-2 shrink-0" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Add organization
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['ALL', 'HOSPITAL', 'DISTRIBUTOR'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t === 'ALL' ? 'All' : t === 'HOSPITAL' ? 'Hospitals' : 'Distributors'}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <p className="text-gray-500 text-sm py-8 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">No organizations match this filter.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">Organization ID</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Registration</th>
                <th className="pb-3 pr-4 font-medium">Location</th>
                <th className="pb-3 pr-4 font-medium">Contact</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(o => (
                <tr key={o.id} className="text-gray-800">
                  <td className="py-3 pr-4 font-medium text-gray-900">{o.name}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-700 max-w-[220px] break-all">
                    {o.id}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={typeBadge[o.type] ?? 'badge-gray'}>{o.type}</span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{o.registrationNumber}</td>
                  <td className="py-3 pr-4 text-gray-600">
                    {[o.address?.city, o.address?.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    <div className="text-xs">{o.contactEmail}</div>
                    <div className="text-xs text-gray-500">{o.contactPhone}</div>
                  </td>
                  <td className="py-3 pr-4">
                    {o.active ? (
                      <span className="text-green-700 font-medium">Active</span>
                    ) : (
                      <span className="text-gray-500 font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                      onClick={() => openEdit(o)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    {o.active ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded ml-1"
                        onClick={() => handleDeactivate(o)}
                        disabled={deactivateMut.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-1 text-green-700 hover:bg-green-50 rounded ml-1"
                        onClick={() => handleReactivate(o)}
                        disabled={updateMut.isPending}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="presentation"
          onClick={() => !busy && closeModal()}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-white rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? 'Edit organization' : 'Add organization'}
              </h2>
              <button type="button" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" disabled={busy} onClick={closeModal}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="p-5 space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
              {editing && (
                <div>
                  <label className="form-label">Organization ID (MongoDB)</label>
                  <p className="font-mono text-xs break-all bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800">
                    {editing.id}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Use this ID in orders, products, and user registration.</p>
                </div>
              )}
              <div>
                <label className="form-label">Type</label>
                <select className="form-input" {...form.register('type')}>
                  <option value="HOSPITAL">Hospital</option>
                  <option value="DISTRIBUTOR">Distributor</option>
                </select>
              </div>
              <div>
                <label className="form-label">Name</label>
                <input className="form-input" {...form.register('name')} />
                {form.formState.errors.name && <p className="text-xs text-red-600 mt-1">{form.formState.errors.name.message}</p>}
              </div>
              <div>
                <label className="form-label">Registration number</label>
                <input className="form-input" {...form.register('registrationNumber')} disabled={!!editing} />
                {form.formState.errors.registrationNumber && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.registrationNumber.message}</p>
                )}
                {editing && <p className="text-xs text-gray-500 mt-1">Registration number cannot be changed.</p>}
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Address</p>
              <div>
                <label className="form-label">Street</label>
                <input className="form-input" {...form.register('street')} />
                {form.formState.errors.street && <p className="text-xs text-red-600 mt-1">{form.formState.errors.street.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">City</label>
                  <input className="form-input" {...form.register('city')} />
                  {form.formState.errors.city && <p className="text-xs text-red-600 mt-1">{form.formState.errors.city.message}</p>}
                </div>
                <div>
                  <label className="form-label">State</label>
                  <input className="form-input" {...form.register('state')} />
                  {form.formState.errors.state && <p className="text-xs text-red-600 mt-1">{form.formState.errors.state.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Pincode</label>
                  <input className="form-input" {...form.register('pincode')} />
                  {form.formState.errors.pincode && <p className="text-xs text-red-600 mt-1">{form.formState.errors.pincode.message}</p>}
                </div>
                <div>
                  <label className="form-label">Country</label>
                  <input className="form-input" {...form.register('country')} />
                  {form.formState.errors.country && <p className="text-xs text-red-600 mt-1">{form.formState.errors.country.message}</p>}
                </div>
              </div>

              <div>
                <label className="form-label">Contact email</label>
                <input type="email" className="form-input" {...form.register('contactEmail')} />
                {form.formState.errors.contactEmail && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.contactEmail.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Contact phone</label>
                <input className="form-input" {...form.register('contactPhone')} />
                {form.formState.errors.contactPhone && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.contactPhone.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">License # (optional)</label>
                  <input className="form-input" {...form.register('licenseNumber')} />
                </div>
                <div>
                  <label className="form-label">License expiry (optional)</label>
                  <input type="date" className="form-input" {...form.register('licenseExpiry')} />
                </div>
              </div>

              {editing && (
                <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
                  <input type="checkbox" className="rounded border-gray-300" {...form.register('active')} />
                  Active (visible in lists and assignable to users)
                </label>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button type="button" className="btn-secondary" disabled={busy} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
