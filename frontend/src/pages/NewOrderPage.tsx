import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { ordersApi } from '../api/orders'
import { organizationsApi } from '../api/organizations'
import { productsApi } from '../api/products'
import type { Product } from '../types'

type Line = { productId: string; quantity: number }

export default function NewOrderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [distributorOrgId, setDistributorOrgId] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }])

  const { data: distributors = [], isLoading: distLoading } = useQuery({
    queryKey: ['organizations', 'DISTRIBUTOR', 'new-order'],
    queryFn: () => organizationsApi.listByType('DISTRIBUTOR'),
  })

  const activeDistributors = useMemo(() => distributors.filter(d => d.active), [distributors])

  const { data: productPage, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'new-order-picker'],
    queryFn: () => productsApi.list({ page: 0, size: 200 }),
  })

  const catalogProducts = useMemo(() => productPage?.content ?? [], [productPage?.content])

  const productById = useMemo(() => {
    const m = new Map<string, Product>()
    catalogProducts.forEach(p => m.set(p.id, p))
    return m
  }, [catalogProducts])

  const createMut = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      toast.success('Order placed')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate('/orders')
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d ?? 'Could not create order')
    },
  })

  const addLine = () => setLines(prev => [...prev, { productId: '', quantity: 1 }])

  const removeLine = (idx: number) => {
    setLines(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const submit = () => {
    if (!distributorOrgId) {
      toast.error('Select a distributor')
      return
    }
    if (!shippingAddress.trim()) {
      toast.error('Shipping address is required')
      return
    }
    const items = lines
      .filter(l => l.productId && l.quantity >= 1)
      .map(l => ({ productId: l.productId, quantity: l.quantity }))
    if (items.length === 0) {
      toast.error('Add at least one product line')
      return
    }
    createMut.mutate({
      distributorOrgId,
      shippingAddress: shippingAddress.trim(),
      notes: notes.trim() || undefined,
      items,
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to orders
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New order</h1>
        <p className="text-gray-500 text-sm mt-1">Choose distributor, shipping address, and line items.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="form-label" htmlFor="dist">Distributor</label>
          {distLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <select
              id="dist"
              className="form-input"
              value={distributorOrgId}
              onChange={e => setDistributorOrgId(e.target.value)}
            >
              <option value="">— Select distributor —</option>
              {activeDistributors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.registrationNumber}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="form-label" htmlFor="ship">Shipping address</label>
          <textarea
            id="ship"
            className="form-input min-h-[88px]"
            placeholder="Full delivery address"
            value={shippingAddress}
            onChange={e => setShippingAddress(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label" htmlFor="notes">Notes (optional)</label>
          <input
            id="notes"
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="PO number, department, etc."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="form-label mb-0">Line items</label>
              <p className="text-xs text-gray-500 mt-1">
                Pick a product by name and <span className="font-medium">Stock Keeping Unit (SKU)</span>; SKU is the unique catalog code for inventory and orders.
              </p>
            </div>
            <button type="button" className="text-sm text-blue-600 flex items-center gap-1" onClick={addLine}>
              <Plus className="w-4 h-4" /> Add line
            </button>
          </div>
          {productsLoading ? (
            <p className="text-sm text-gray-500">Loading products…</p>
          ) : catalogProducts.length === 0 ? (
            <p className="text-sm text-amber-700">No products in catalog yet.</p>
          ) : (
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 min-w-0">
                    <label className="sr-only">Product</label>
                    <select
                      className="form-input"
                      value={line.productId}
                      onChange={e => updateLine(idx, { productId: e.target.value })}
                    >
                      <option value="">— Product —</option>
                      {catalogProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          Stock Keeping Unit (SKU) {p.sku} — {p.name} (₹{p.wholesalePrice})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-28">
                    <label className="sr-only">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input"
                      value={line.quantity}
                      onChange={e => updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <button
                    type="button"
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg self-end"
                    onClick={() => removeLine(idx)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Link to="/orders" className="btn-secondary">Cancel</Link>
          <button type="button" className="btn-primary" onClick={submit} disabled={createMut.isPending}>
            {createMut.isPending ? 'Submitting…' : 'Place order'}
          </button>
        </div>
      </div>

      {lines.some(l => l.productId) && (
        <p className="text-xs text-gray-500">
          Preview:{' '}
          {lines
            .filter(l => l.productId)
            .map(l => `${productById.get(l.productId)?.name ?? l.productId} × ${l.quantity}`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
