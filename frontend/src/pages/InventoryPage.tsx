import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSearchParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, Clock, CheckCircle, Plus, X } from 'lucide-react'
import { format } from 'date-fns'
import { productsApi } from '../api/products'
import { useAuthStore } from '../store/authStore'
import type { InventoryItem, Product } from '../types'

const statusBadge: Record<InventoryItem['status'], string> = {
  IN_STOCK: 'badge-green',
  LOW_STOCK: 'badge-amber',
  OUT_OF_STOCK: 'badge-red',
  EXPIRED: 'badge-red',
  QUARANTINED: 'badge-purple',
}

const stockBatchSchema = z.object({
  productId: z.string().min(1, 'Select a product'),
  distributorId: z.string().min(1),
  warehouseId: z.string().min(1, 'Warehouse ID is required'),
  warehouseLocation: z.string().optional(),
  batchNumber: z.string().min(1, 'Batch number is required'),
  manufacturingDate: z.string().optional(),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  reorderLevel: z.coerce.number().int().min(0),
})

type StockBatchForm = z.infer<typeof stockBatchSchema>

function sellableUnits(item: InventoryItem) {
  return Math.max(0, item.quantityAvailable - item.quantityReserved)
}

function isAttentionBatch(item: InventoryItem) {
  return (
    item.status !== 'EXPIRED'
    && item.status !== 'QUARANTINED'
    && sellableUnits(item) <= item.reorderLevel
  )
}

export default function InventoryPage() {
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [stockModalOpen, setStockModalOpen] = useState(false)

  const canManageStock = user?.role === 'ADMIN' || user?.role === 'DISTRIBUTOR'

  useEffect(() => {
    if (!canManageStock || !user) return
    if (searchParams.get('productId')) {
      setStockModalOpen(true)
    }
  }, [canManageStock, user, searchParams])

  const inventoryEnabled =
    !!user && (user.role === 'ADMIN' || user.role === 'DISTRIBUTOR')

  const { data: batches, isLoading: loadingBatches } = useQuery({
    queryKey: ['inventory', 'batches', user?.role, user?.organizationId],
    queryFn: productsApi.listBatches,
    enabled: inventoryEnabled,
  })

  const lowStock = useMemo(
    () => (batches ?? []).filter(isAttentionBatch),
    [batches]
  )

  const { activeBatchCount, stockHealth, totalAvailableUnits } = useMemo(() => {
    const rows = (batches ?? []).filter(
      i => i.status !== 'EXPIRED' && i.status !== 'QUARANTINED'
    )
    if (rows.length === 0) {
      return { activeBatchCount: 0, stockHealth: null as number | null, totalAvailableUnits: 0 }
    }
    const low = rows.filter(i => sellableUnits(i) <= i.reorderLevel).length
    const totalAvail = rows.reduce((s, i) => s + sellableUnits(i), 0)
    return {
      activeBatchCount: rows.length,
      stockHealth: Math.round(((rows.length - low) / rows.length) * 100),
      totalAvailableUnits: totalAvail,
    }
  }, [batches])

  const { data: expiring, isLoading: loadingExp } = useQuery({
    queryKey: ['inventory', 'expiring', 30],
    queryFn: () => productsApi.getExpiring(30),
    enabled: inventoryEnabled,
  })

  const { data: productCatalog } = useQuery({
    queryKey: ['products', 'inventory-picker', user?.role, user?.organizationId],
    queryFn: () =>
      productsApi.list({
        page: 0,
        size: 500,
        distributorId: user?.role === 'DISTRIBUTOR' ? user?.organizationId : undefined,
      }),
    enabled: stockModalOpen && canManageStock && !!user,
  })

  const productOptions = useMemo(
    () => (productCatalog?.content ?? []).filter((p: Product) => p.active),
    [productCatalog]
  )

  const form = useForm<StockBatchForm>({
    resolver: zodResolver(stockBatchSchema),
    defaultValues: {
      productId: '',
      distributorId: '',
      warehouseId: 'WH-MAIN',
      warehouseLocation: '',
      batchNumber: '',
      manufacturingDate: '',
      expiryDate: '',
      quantity: 1,
      reorderLevel: 10,
    },
  })

  const watchProductId = form.watch('productId')

  useEffect(() => {
    if (!watchProductId) return
    const p = productOptions.find((x: Product) => x.id === watchProductId)
    if (p) {
      form.setValue('distributorId', p.distributorId)
    }
  }, [watchProductId, productOptions, form])

  useEffect(() => {
    if (!stockModalOpen || !canManageStock) return
    const pid = searchParams.get('productId')
    if (!pid || productOptions.length === 0) return
    const p = productOptions.find((x: Product) => x.id === pid)
    if (p) {
      form.reset({
        productId: p.id,
        distributorId: p.distributorId,
        warehouseId: 'WH-MAIN',
        warehouseLocation: '',
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
        quantity: 1,
        reorderLevel: 10,
      })
    }
  }, [stockModalOpen, searchParams, productOptions, canManageStock, form])

  const addStockMut = useMutation({
    mutationFn: productsApi.addStock,
    onSuccess: () => {
      toast.success('Stock batch saved')
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setStockModalOpen(false)
      setSearchParams({})
      form.reset({
        productId: '',
        distributorId: '',
        warehouseId: 'WH-MAIN',
        warehouseLocation: '',
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
        quantity: 1,
        reorderLevel: 10,
      })
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d ?? 'Could not save stock')
    },
  })

  const openStockModal = () => {
    form.reset({
      productId: '',
      distributorId: '',
      warehouseId: 'WH-MAIN',
      warehouseLocation: '',
      batchNumber: '',
      manufacturingDate: '',
      expiryDate: '',
      quantity: 1,
      reorderLevel: 10,
    })
    const pid = searchParams.get('productId')
    if (pid) {
      form.setValue('productId', pid)
    }
    setStockModalOpen(true)
  }

  const onSubmitStock = (data: StockBatchForm) => {
    addStockMut.mutate({
      productId: data.productId,
      warehouseId: data.warehouseId.trim(),
      warehouseLocation: data.warehouseLocation?.trim() || undefined,
      batchNumber: data.batchNumber.trim(),
      manufacturingDate: data.manufacturingDate?.trim() || undefined,
      expiryDate: data.expiryDate,
      quantity: data.quantity,
      reorderLevel: data.reorderLevel,
      distributorId: data.distributorId.trim(),
    })
  }

  return (
    <div className="space-y-6">
      {!inventoryEnabled && (
        <div className="card border-amber-200 bg-amber-50 text-amber-900 text-sm">
          Inventory batches and stock levels are visible to <strong>Admin</strong> and <strong>Distributor</strong> roles.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Monitor stock and record batches (warehouse, batch number, expiry) so orders can be approved.
          </p>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl">
            Approving an order <strong>reserves</strong> sellable units (quantity available minus already reserved).
            Use <strong>Add stock (batch)</strong> below for each product before you have enough sellable units.
          </p>
        </div>
        {canManageStock && (
          <button type="button" onClick={openStockModal} className="btn-primary inline-flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add stock (batch)
          </button>
        )}
      </div>

      {stockModalOpen && canManageStock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="presentation"
          onClick={() => {
            if (addStockMut.isPending) return
            setStockModalOpen(false)
            setSearchParams({})
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-stock-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-white rounded-t-xl">
              <h2 id="add-stock-title" className="text-lg font-semibold text-gray-900">
                Add stock (batch)
              </h2>
              <button
                type="button"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                disabled={addStockMut.isPending}
                onClick={() => { setStockModalOpen(false); setSearchParams({}) }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="p-5 space-y-4" onSubmit={form.handleSubmit(onSubmitStock)}>
              <div>
                <label className="form-label" htmlFor="stock-product">
                  Product (active catalog)
                </label>
                <select id="stock-product" className="form-input" {...form.register('productId')}>
                  <option value="">— Select —</option>
                  {productOptions.map((p: Product) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.productId && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.productId.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Stock Keeping Unit (SKU) is shown first for each row. Same product + warehouse + batch updates quantity.
                </p>
              </div>

              <input type="hidden" {...form.register('distributorId')} />

              <div>
                <label className="form-label" htmlFor="stock-wh">
                  Warehouse ID
                </label>
                <input id="stock-wh" className="form-input" placeholder="e.g. WH-MAIN" {...form.register('warehouseId')} />
                {form.formState.errors.warehouseId && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.warehouseId.message}</p>
                )}
              </div>

              <div>
                <label className="form-label">Location (optional)</label>
                <input className="form-input" {...form.register('warehouseLocation')} />
              </div>

              <div>
                <label className="form-label">Batch number</label>
                <input className="form-input font-mono text-sm" placeholder="e.g. B2026-04-A" {...form.register('batchNumber')} />
                {form.formState.errors.batchNumber && (
                  <p className="text-xs text-red-600 mt-1">{form.formState.errors.batchNumber.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Mfg date (optional)</label>
                  <input type="date" className="form-input" {...form.register('manufacturingDate')} />
                </div>
                <div>
                  <label className="form-label">Expiry date</label>
                  <input type="date" className="form-input" {...form.register('expiryDate')} />
                  {form.formState.errors.expiryDate && (
                    <p className="text-xs text-red-600 mt-1">{form.formState.errors.expiryDate.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Quantity received</label>
                  <input type="number" min={1} className="form-input" {...form.register('quantity')} />
                  {form.formState.errors.quantity && (
                    <p className="text-xs text-red-600 mt-1">{form.formState.errors.quantity.message}</p>
                  )}
                </div>
                <div>
                  <label className="form-label">Reorder alert at</label>
                  <input type="number" min={0} className="form-input" {...form.register('reorderLevel')} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={addStockMut.isPending}
                  onClick={() => { setStockModalOpen(false); setSearchParams({}) }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={addStockMut.isPending}>
                  {addStockMut.isPending ? 'Saving…' : 'Save batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="card bg-amber-50 border-amber-100">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-700">{inventoryEnabled ? lowStock.length : '—'}</p>
              <p className="text-sm text-amber-600">Low / at reorder (batches)</p>
              <p className="text-xs text-amber-800/80 mt-1">
                Available ≤ reorder level (excludes expired / quarantined)
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-red-50 border-red-100">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-red-700">{inventoryEnabled ? (expiring?.length ?? 0) : '—'}</p>
              <p className="text-sm text-red-600">Expiring in 30 days</p>
            </div>
          </div>
        </div>
        <div className="card bg-green-50 border-green-100">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-green-700">
                {inventoryEnabled ? (stockHealth !== null ? `${stockHealth}%` : '—') : '—'}
              </p>
              <p className="text-sm text-green-600">Stock health</p>
              <p className="text-xs text-green-800/80 mt-1">
                {inventoryEnabled && activeBatchCount > 0
                  ? `${activeBatchCount} active batch(es) · ${totalAvailableUnits.toLocaleString()} units available to ship`
                  : inventoryEnabled
                    ? 'Add stock batches to see health'
                    : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Full batch list — available (sellable) highlighted */}
      {inventoryEnabled && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-1">Stock by batch</h3>
          <p className="text-sm text-gray-500 mb-4">
            <strong>Available</strong> = stored quantity minus reserved (what you can still allocate to new orders).
          </p>
          {loadingBatches ? (
            <div className="animate-pulse space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-3 font-medium">Product</th>
                    <th className="pb-3 font-medium">SKU</th>
                    <th className="pb-3 font-medium">Warehouse</th>
                    <th className="pb-3 font-medium">Batch</th>
                    <th className="pb-3 font-medium text-right">Available</th>
                    <th className="pb-3 font-medium text-right">Stored</th>
                    <th className="pb-3 font-medium text-right">Reserved</th>
                    <th className="pb-3 font-medium text-right">Reorder at</th>
                    <th className="pb-3 font-medium">Expiry</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(batches ?? []).map(item => {
                    const avail = sellableUnits(item)
                    const low = isAttentionBatch(item)
                    return (
                      <tr
                        key={item.id}
                        className={low ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-gray-50'}
                      >
                        <td className="py-3 font-medium text-gray-900">{item.productName}</td>
                        <td className="py-3 font-mono text-xs text-gray-600">{item.productSku}</td>
                        <td className="py-3 text-gray-600">{item.warehouseId}</td>
                        <td className="py-3 text-gray-600 font-mono text-xs">{item.batchNumber}</td>
                        <td className="py-3 text-right font-bold tabular-nums text-gray-900">{avail}</td>
                        <td className="py-3 text-right text-gray-600 tabular-nums">{item.quantityAvailable}</td>
                        <td className="py-3 text-right text-gray-600 tabular-nums">{item.quantityReserved}</td>
                        <td className="py-3 text-right text-gray-600 tabular-nums">{item.reorderLevel}</td>
                        <td className="py-3 text-gray-600">
                          {item.expiryDate
                            ? format(new Date(item.expiryDate), 'dd MMM yyyy')
                            : '—'}
                        </td>
                        <td className="py-3">
                          <span className={statusBadge[item.status]}>{item.status.replace('_', ' ')}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {(batches ?? []).length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-400">
                        No inventory batches yet. Use <strong>Add stock (batch)</strong> to record receipt.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Low stock table */}
      {inventoryEnabled && (
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Batches at or below reorder
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Same rule as above: <strong>available</strong> (sellable) ≤ reorder threshold.
        </p>
        {loadingBatches ? (
          <div className="animate-pulse space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">Product</th>
                  <th className="pb-3 font-medium">Stock Keeping Unit (SKU)</th>
                  <th className="pb-3 font-medium">Warehouse</th>
                  <th className="pb-3 font-medium">Batch</th>
                  <th className="pb-3 font-medium text-right">Available</th>
                  <th className="pb-3 font-medium text-right">Stored</th>
                  <th className="pb-3 font-medium text-right">Reserved</th>
                  <th className="pb-3 font-medium text-right">Reorder at</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lowStock.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-900">{item.productName}</td>
                    <td className="py-3 font-mono text-xs text-gray-600">{item.productSku}</td>
                    <td className="py-3 text-gray-600">{item.warehouseId}</td>
                    <td className="py-3 text-gray-600 font-mono text-xs">{item.batchNumber}</td>
                    <td className="py-3 text-right font-bold text-amber-700 tabular-nums">{sellableUnits(item)}</td>
                    <td className="py-3 text-right text-gray-700 tabular-nums">{item.quantityAvailable}</td>
                    <td className="py-3 text-right text-gray-600 tabular-nums">{item.quantityReserved}</td>
                    <td className="py-3 text-right text-gray-600 tabular-nums">{item.reorderLevel}</td>
                    <td className="py-3">
                      <span className={statusBadge[item.status]}>{item.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
                {lowStock.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-400">
                      No batches are at reorder right now — or you have not added inventory yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Expiring soon */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-red-500" />
          Expiring Within 30 Days
        </h3>
        {!inventoryEnabled ? (
          <p className="text-gray-500 text-sm py-4">—</p>
        ) : loadingExp ? (
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">Product</th>
                  <th className="pb-3 font-medium">Stock Keeping Unit (SKU)</th>
                  <th className="pb-3 font-medium">Batch</th>
                  <th className="pb-3 font-medium">Expiry Date</th>
                  <th className="pb-3 font-medium text-right">Available</th>
                  <th className="pb-3 font-medium text-right">Stored</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expiring?.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-900">{item.productName}</td>
                    <td className="py-3 font-mono text-xs text-gray-600">{item.productSku}</td>
                    <td className="py-3 font-mono text-xs text-gray-600">{item.batchNumber}</td>
                    <td className="py-3 text-red-600 font-medium">
                      {format(new Date(item.expiryDate), 'dd MMM yyyy')}
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900 tabular-nums">{sellableUnits(item)}</td>
                    <td className="py-3 text-right text-gray-700 tabular-nums">{item.quantityAvailable}</td>
                    <td className="py-3">
                      <span className={statusBadge[item.status]}>{item.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
                {expiring?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      No items expiring in the next 30 days
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManageStock && (
        <p className="text-sm text-gray-500 text-center">
          Tip: from <Link to="/products" className="text-blue-600 font-medium hover:underline">Products</Link>, use{' '}
          <strong>Stock</strong> on a product card to open this form with that item pre-selected.
        </p>
      )}
    </div>
  )
}
