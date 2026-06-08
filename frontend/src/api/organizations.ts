import { userApi } from './axios'
import type { Organization } from '../types'

export type OrganizationWritePayload = Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>

export const organizationsApi = {
  /** Active organizations only (all authenticated roles). */
  listActive: () =>
    userApi.get<Organization[]>('organizations').then(r => r.data),

  /** Admin: active + inactive. */
  listAllAdmin: () =>
    userApi.get<Organization[]>('organizations/admin/list').then(r => r.data),

  listByType: (type: Organization['type']) =>
    userApi.get<Organization[]>(`organizations/type/${type}`).then(r => r.data),

  getById: (id: string) =>
    userApi.get<Organization>(`organizations/${id}`).then(r => r.data),

  create: (body: OrganizationWritePayload) =>
    userApi.post<Organization>('organizations', body).then(r => r.data),

  update: (id: string, body: Organization) =>
    userApi.put<Organization>(`organizations/${id}`, body).then(r => r.data),

  /** Soft-delete: sets active to false. */
  deactivate: (id: string) =>
    userApi.delete<void>(`organizations/${id}`).then(r => r.data),
}
