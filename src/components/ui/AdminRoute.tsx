import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/useAuthStore'
import Loading from '@/components/ui/Loading'

/** Comma-separated admin emails, set in .env as VITE_ADMIN_EMAILS */
function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined
  if (!raw) return false
  return raw.split(',').map((e) => e.trim().toLowerCase()).includes(email.toLowerCase())
}

export default function AdminRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const email = useAuthStore((s) => s.user?.email)
  if (isLoading) return <Loading />
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />
  if (!isAdmin(email)) return <Navigate to="/admin/login" replace />
  return <Outlet />
}
