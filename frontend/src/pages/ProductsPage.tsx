import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Package, Search, Filter, X, Pencil, Trash2, Boxes } from 'lucide-react'
import { productsApi } from '../api/products'
import { organizationsApi } from '../api/organizations'
import { useAuthStore } from '../store/authStore'
import type { Product, User } from '../types'

const categories = ['ALL', 'MEDICINE', 'SURGICAL', 'DIAGNOSTIC', 'EQUIPMENT', 'CONSUMABLE', 'VACCINE']

const categoryBadge: Record<string, string> = {
  MEDICINE: 'badge-blue',
  SURGICAL: 'badge-red',
  DIAGNOSTIC: 'badge-purple',
  EQUIPMENT: 'badge-gray',
  CONSUMABLE: 'badge-amber',
  VACCINE: 'badge-green',
}

const UNIT_OPTIONS = ['strip', 'box', 'vial', 'bottle', 'tube', 'piece', 'kg', 'litre'] as const

const simpleProductSchema = z.object({
  distributorId: z.string().optional(),
  sku: z.string().min(1, 'Stock Keeping Unit (SKU) code is required'),
  name: z.string().min(1, 'Name is required'),
  manufacturer: z.string().min(1, 'Manufacturer is required'),
  category: z.enum(['MEDICINE', 'SURGICAL', 'DIAGNOSTIC', 'EQUIPMENT', 'CONSUMABLE', 'VACCINE']),
  type: z.enum(['BRANDED', 'GENERIC']),
  unit: z.string().min(1, 'Unit is required'),
  mrp: z.coerce.number().positive('MRP must be greater than 0'),
  wholesalePrice: z.coerce.number().positive('Wholesale must be greater than 0'),
  prescriptionRequired: z.boolean(),
  controlledSubstance: z.boolean(),
})

type SimpleProductForm = z.infer<typeof simpleProductSchema>

function orgDropdownLabel(org: { name: string; registrationNumber: string; id: string }) {
  return `${org.name} · ${org.registrationNumber} · ${org.id}`
}

function emptyFormDefaults(user: User): SimpleProductForm {
  return {
    distributorId: user.role === 'DISTRIBUTOR' ? user.organizationId : '',
    sku: '',
    name: '',
    manufacturer: '',
    category: 'MEDICINE',
    type: 'BRANDED',
    unit: 'strip',
    mrp: 0,
    wholesalePrice: 0,
    prescriptionRequired: false,
    controlledSubstance: false,
  }
}

function productToFormValues(product: Product): SimpleProductForm {
  return {
    distributorId: product.distributorId,
    sku: product.sku,
    name: product.name,
    manufacturer: product.manufacturer,
    category: product.category,
    type: product.type,
    unit: product.unit,
    mrp: Number(product.mrp),
    wholesalePrice: Number(product.wholesalePrice),
    prescriptionRequired: product.prescriptionRequired,
    controlledSubstance: product.controlledSubstance,
  }
}

export default function ProductsPage() {
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [page, setPage] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const distributorScope =
    user?.role === 'DISTRIBUTOR' && user.organizationId ? user.organizationId : undefined

  const { data, isLoading } = useQuery({
    queryKey: ['products', category, page, user?.role, user?.organizationId],
    queryFn: () =>
      productsApi.list({
        category: category === 'ALL' ? undefined : category,
        distributorId: distributorScope,
        page,
        size: 12,
      }),
  })

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['products', 'search', search, user?.role, user?.organizationId],
    queryFn: () => productsApi.search(search, 0, distributorScope),
    enabled: search.length > 2,
  })

  const products = search.length > 2 ? searchResults?.content : data?.content

  const { data: distributorOrgs = [], isLoading: distributorsLoading } = useQuery({
    queryKey: ['organizations', 'DISTRIBUTOR'],
    queryFn: () => organizationsApi.listByType('DISTRIBUTOR'),
    enabled: addOpen && user?.role === 'ADMIN',
  })

  const activeDistributors = useMemo(
    () => distributorOrgs.filter(o => o.active),
    [distributorOrgs]
  )

  const { data: myOrganization } = useQuery({
    queryKey: ['organizations', user?.organizationId],
    queryFn: () => organizationsApi.getById(user!.organizationId),
    enabled: addOpen && user?.role === 'DISTRIBUTOR' && !!user?.organizationId,
  })

  const form = useForm<SimpleProductForm>({
    resolver: zodResolver(simpleProductSchema),
    defaultValues: user
      ? emptyFormDefaults(user)
      : {
          distributorId: '',
          sku: '',
          name: '',
          manufacturer: '',
          category: 'MEDICINE',
          type: 'BRANDED',
          unit: 'strip',
          mrp: 0,
          wholesalePrice: 0,
          prescriptionRequired: false,
          controlledSubstance: false,
        },
  })

  useEffect(() => {
    if (!addOpen || !user) return
    if (editingProduct) {
      form.reset(productToFormValues(editingProduct))
    } else {
      form.reset(emptyFormDefaults(user))
    }
    // Intentionally depend on product id, not whole `editingProduct`, to avoid redundant resets.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.reset is stable; including `form` re-runs every render
  }, [addOpen, editingProduct?.id, user, form.reset])

  useEffect(() => {
    if (!addOpen || user?.role !== 'ADMIN' || editingProduct) return
    if (activeDistributors.length !== 1) return
    const only = activeDistributors[0]
    if (only?.id && !form.getValues('distributorId')) {
      form.setValue('distributorId', only.id)
    }
    // `form` identity changes; methods are stable for this gated effect.
  }, [addOpen, user?.role, editingProduct, activeDistributors, form])

  const closeProductModal = () => {
    setAddOpen(false)
    setEditingProduct(null)
  }

  const createMutation = useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      toast.success('Product created')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      closeProductModal()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Failed to create product')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof productsApi.update>[1] }) =>
      productsApi.update(id, body),
    onSuccess: () => {
      toast.success('Product updated')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      closeProductModal()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Failed to update product')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: productsApi.remove,
    onSuccess: () => {
      toast.success('Product removed from catalog')
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Failed to remove product')
    },
  })

  const formBusy = createMutation.isPending || updateMutation.isPending

  const buildPayload = (data: SimpleProductForm): Parameters<typeof productsApi.create>[0] => {
    const distributorId =
      user?.role === 'DISTRIBUTOR' ? user.organizationId : data.distributorId?.trim()
    return {
      sku: data.sku.trim(),
      name: data.name.trim(),
      manufacturer: data.manufacturer.trim(),
      category: data.category,
      type: data.type,
      unit: data.unit.trim(),
      mrp: data.mrp,
      wholesalePrice: data.wholesalePrice,
      prescriptionRequired: data.prescriptionRequired,
      controlledSubstance: data.controlledSubstance,
      distributorId: distributorId!,
    }
  }

  const onSubmitProduct = (data: SimpleProductForm) => {
    if (!user) return
    const distributorId =
      user.role === 'DISTRIBUTOR' ? user.organizationId : data.distributorId?.trim()
    if (user.role === 'ADMIN' && !distributorId) {
      toast.error('Select a distributor organization')
      return
    }
    const body = buildPayload(data)
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, body })
    } else {
      createMutation.mutate(body)
    }
  }

  const canAddProduct = user?.role === 'ADMIN' || user?.role === 'DISTRIBUTOR'

  const canManageProduct = (p: Product) =>
    user?.role === 'ADMIN' ||
    (user?.role === 'DISTRIBUTOR' && p.distributorId === user.organizationId)

  const openAddModal = () => {
    setEditingProduct(null)
    setAddOpen(true)
  }

  const openEditModal = (p: Product) => {
    setEditingProduct(p)
    setAddOpen(true)
  }

  const confirmRemove = (p: Product) => {
    if (!window.confirm(`Remove “${p.name}” from the catalog? This cannot be undone from the UI.`)) {
      return
    }
    deleteMutation.mutate(p.id)
  }

  const adminOrgSelectBlocked =
    user?.role === 'ADMIN' && (distributorsLoading || activeDistributors.length === 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.totalElements ?? 0} products available
          </p>
        </div>
        {canAddProduct && (
          <button type="button" className="btn-primary" onClick={openAddModal}>
            + Add Product
          </button>
        )}
      </div>

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="presentation"
          onClick={() => !formBusy && closeProductModal()}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-white rounded-t-xl">
              <h2 id="product-modal-title" className="text-lg font-semibold text-gray-900">
                {editingProduct ? 'Edit product' : 'Add product'}
              </h2>
              <button
                type="button"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                disabled={formBusy}
                onClick={closeProductModal}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={form.handleSubmit(onSubmitProduct)}>
              {user?.role === 'ADMIN' && (
                <div>
                  <label className="form-label" htmlFor="product-org">
                    Organization (distributor)
                  </label>
                  {distributorsLoading ? (
                    <p className="text-sm text-gray-500 py-2">Loading organizations…</p>
                  ) : activeDistributors.length === 0 ? (
                    <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      No active distributor organizations found. Create one first.
                    </p>
                  ) : (
                    <>
                      <select
                        id="product-org"
                        className="form-input"
                        {...form.register('distributorId')}
                      >
                        <option value="">— Select organization —</option>
                        {activeDistributors.map(org => (
                          <option key={org.id} value={org.id}>
                            {orgDropdownLabel(org)}
                          </option>
                        ))}
                        {editingProduct &&
                          !activeDistributors.some(o => o.id === editingProduct.distributorId) && (
                            <option value={editingProduct.distributorId}>
                              Current distributor · {editingProduct.distributorId}
                            </option>
                          )}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Name, registration number, and MongoDB ID are shown for each row.
                      </p>
                    </>
                  )}
                </div>
              )}

              {user?.role === 'DISTRIBUTOR' && myOrganization && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">Your organization</p>
                  <p className="text-gray-700 mt-0.5">{myOrganization.name}</p>
                  <p className="text-xs text-gray-500 mt-1 font-mono break-all">
                    ID: {myOrganization.id}
                  </p>
                </div>
              )}

              <div>
                <label className="form-label" htmlFor="product-sku">
                  Stock Keeping Unit (SKU)
                </label>
                <input
                  id="product-sku"
                  className="form-input"
                  autoComplete="off"
                  placeholder="e.g. PARA-500-TAB-001"
                  {...form.register('sku')}
                />
                <p className="text-xs text-gray-500 mt-1">
                  SKU is the unique product code used for inventory, orders, and regulatory traceability.
                </p>
                {form.formState.errors.sku && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.sku.message}</p>
                )}
              </div>

              <div>
                <label className="form-label">Product name</label>
                <input className="form-input" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="form-label">Manufacturer</label>
                <input className="form-input" {...form.register('manufacturer')} />
                {form.formState.errors.manufacturer && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.manufacturer.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input" {...form.register('category')}>
                    {categories.filter(c => c !== 'ALL').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <select className="form-input" {...form.register('unit')}>
                    {UNIT_OPTIONS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="product-type">
                  Product type
                </label>
                <select id="product-type" className="form-input" {...form.register('type')}>
                  <option value="BRANDED">Branded</option>
                  <option value="GENERIC">Generic</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">MRP (₹)</label>
                  <input type="number" step="0.01" min="0" className="form-input" {...form.register('mrp')} />
                  {form.formState.errors.mrp && (
                    <p className="text-xs text-red-600 mt-1">{form.formState.errors.mrp.message}</p>
                  )}
                </div>
                <div>
                  <label className="form-label">Wholesale (₹)</label>
                  <input type="number" step="0.01" min="0" className="form-input" {...form.register('wholesalePrice')} />
                  {form.formState.errors.wholesalePrice && (
                    <p className="text-xs text-red-600 mt-1">{form.formState.errors.wholesalePrice.message}</p>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="rounded border-gray-300" {...form.register('prescriptionRequired')} />
                Prescription required
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="rounded border-gray-300" {...form.register('controlledSubstance')} />
                Controlled substance
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={formBusy}
                  onClick={closeProductModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    formBusy
                    || (!editingProduct && user?.role === 'ADMIN' && adminOrgSelectBlocked)
                  }
                >
                  {formBusy ? 'Saving…' : editingProduct ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-9"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => { setCategory(cat); setPage(0) }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading || searching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products?.map((product: Product) => (
              <div key={product.id} className="card hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={categoryBadge[product.category] ?? 'badge-gray'}>
                      {product.category}
                    </span>
                    {!product.active && (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1">
                  {product.name}
                </h3>
                {product.genericName && (
                  <p className="text-xs text-gray-500 mb-1">{product.genericName}</p>
                )}
                <p className="text-xs text-gray-400 mb-3">{product.manufacturer}</p>

                <div className="flex items-center justify-between mt-auto">
                  <div>
                    <p className="text-xs text-gray-400">Wholesale</p>
                    <p className="font-bold text-gray-900">₹{product.wholesalePrice}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">MRP</p>
                    <p className="text-sm text-gray-500">₹{product.mrp}</p>
                  </div>
                </div>

                {product.prescriptionRequired && (
                  <p className="text-xs text-red-500 mt-2 font-medium">℞ Prescription required</p>
                )}

                {canManageProduct(product) && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      className="btn-secondary flex-1 min-w-[5rem] text-xs py-2 inline-flex items-center justify-center gap-1"
                      onClick={e => {
                        e.stopPropagation()
                        openEditModal(product)
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    {product.active && (
                      <Link
                        to={`/inventory?productId=${encodeURIComponent(product.id)}`}
                        className="btn-secondary flex-1 min-w-[5rem] text-xs py-2 inline-flex items-center justify-center gap-1 no-underline"
                        onClick={e => e.stopPropagation()}
                      >
                        <Boxes className="w-3.5 h-3.5" />
                        Stock
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn-secondary flex-1 min-w-[5rem] text-xs py-2 inline-flex items-center justify-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                      disabled={deleteMutation.isPending}
                      onClick={e => {
                        e.stopPropagation()
                        confirmRemove(product)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {data && data.totalPages > 1 && search.length <= 2 && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={data.first}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {data.number + 1} of {data.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={data.last}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
