import { productApi } from './axios'
import type { Product, InventoryItem, PageResponse } from '../types'

/** Body for POST /products — matches backend ProductRequest */
export type CreateProductPayload = {
  sku: string
  name: string
  genericName?: string
  description?: string
  manufacturer: string
  category: Product['category']
  type: Product['type']
  dosageForm?: string
  strength?: string
  unit: string
  mrp: number
  wholesalePrice: number
  prescriptionRequired: boolean
  controlledSubstance: boolean
  hsnCode?: string
  gstRate?: number
  distributorId: string
}

export const productsApi = {
  list: (params?: { category?: string; distributorId?: string; page?: number; size?: number }) =>
    productApi.get<PageResponse<Product>>('products', { params }).then(r => r.data),

  search: (q: string, page = 0, distributorId?: string) =>
    productApi.get<PageResponse<Product>>('products/search', {
      params: {
        q,
        page,
        ...(distributorId ? { distributorId } : {}),
      },
    }).then(r => r.data),

  getById: (id: string) =>
    productApi.get<Product>(`products/${id}`).then(r => r.data),

  create: (data: CreateProductPayload) =>
    productApi.post<Product>('products', data).then(r => r.data),

  update: (id: string, data: CreateProductPayload) =>
    productApi.put<Product>(`products/${id}`, data).then(r => r.data),

  remove: (id: string) =>
    productApi.delete<void>(`products/${id}`).then(r => r.data),

  getInventory: (productId: string) =>
    productApi.get<InventoryItem[]>(`products/${productId}/inventory`).then(r => r.data),

  getLowStock: () =>
    productApi.get<InventoryItem[]>('products/inventory/low-stock').then(r => r.data),

  listBatches: () =>
    productApi.get<InventoryItem[]>('products/inventory/batches').then(r => r.data),

  getExpiring: (days = 30) =>
    productApi.get<InventoryItem[]>('products/inventory/expiring', { params: { days } }).then(r => r.data),

  addStock: (data: {
    productId: string
    warehouseId: string
    warehouseLocation?: string
    batchNumber: string
    manufacturingDate?: string
    expiryDate: string
    quantity: number
    reorderLevel: number
    distributorId: string
  }) => productApi.post<InventoryItem>('products/inventory', data).then(r => r.data),
}
