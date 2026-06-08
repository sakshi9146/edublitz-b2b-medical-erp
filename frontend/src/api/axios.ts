import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { useAuthStore } from '../store/authStore'

/** Wrong password on login/register returns 401 — must not redirect or we wipe state and break UX. */
function isPublicAuthRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = config?.url ?? ''
  return url.includes('auth/login') || url.includes('auth/register')
}

const createApiClient = (baseURL: string): AxiosInstance => {
  const client = axios.create({ baseURL, timeout: 15_000 })

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // Leading "/" makes axios treat the path as site-absolute (drops /api/* prefix → server 404).
    if (config.url?.startsWith('/')) {
      config.url = config.url.slice(1)
    }
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error) => {
      if (error.response?.status === 401 && !isPublicAuthRequest(error.config)) {
        useAuthStore.getState().logout()
        // HashRouter: always load SPA shell at / then #/login (works on static Apache without mod_rewrite).
        window.location.replace(`${window.location.origin}/#/login`)
      }
      return Promise.reject(error)
    }
  )

  return client
}

export const userApi = createApiClient(
  import.meta.env.VITE_USER_SERVICE_URL ?? '/api/user'
)

export const productApi = createApiClient(
  import.meta.env.VITE_PRODUCT_SERVICE_URL ?? '/api/product'
)

export const orderApi = createApiClient(
  import.meta.env.VITE_ORDER_SERVICE_URL ?? '/api/order'
)
