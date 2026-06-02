import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/useAuthStore'
import Loading from '@/components/ui/Loading'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  if (isLoading) return <Loading />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}
