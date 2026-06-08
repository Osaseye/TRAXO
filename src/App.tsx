import { Suspense, lazy } from 'react'
import { Routes, Route, useLocation } from 'react-router'
const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const VerifyOTP = lazy(() => import('@/pages/VerifyOTP'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const TradingJournal = lazy(() => import('@/pages/TradingJournal'))
const Profile = lazy(() => import('@/pages/Profile'))
const StrategyManager = lazy(() => import('@/pages/StrategyManager'))
const StrategyDetail = lazy(() => import('@/pages/StrategyDetail'))
const Settings = lazy(() => import('@/pages/Settings'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const JournalDateDetail = lazy(() => import('@/pages/JournalDateDetail'))
const Backtesting = lazy(() => import('@/pages/Backtesting'))
const AdminPanel = lazy(() => import('@/pages/AdminPanel'))
const AdminLogin = lazy(() => import('@/pages/AdminLogin'))
const AdminSignals = lazy(() => import('@/pages/AdminSignals'))
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import PageTransition from '@/components/ui/PageTransition'
import ScrollToTop from '@/components/ui/ScrollToTop'
import NotFound from '@/components/ui/NotFound'
import Loading from '@/components/ui/Loading'
import ProtectedRoute from '@/components/ui/ProtectedRoute'
import AdminRoute from '@/components/ui/AdminRoute'
import { GlobalSignalMonitor } from '@/components/shared/GlobalSignalMonitor'
import { GlobalMultiSymbolScanner } from '@/components/shared/GlobalMultiSymbolScanner'
import { SignalToastStack } from '@/components/shared/SignalToastStack'

export default function App() {
  const location = useLocation()

  return (
    <ErrorBoundary>
      <ScrollToTop />
      <GlobalSignalMonitor />
      <GlobalMultiSymbolScanner />
      <SignalToastStack />
      <Suspense fallback={<Loading />}>
        <PageTransition key={location.key}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-otp" element={<VerifyOTP />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/journal" element={<TradingJournal />} />
              <Route path="/journal/:date" element={<JournalDateDetail />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/strategies" element={<StrategyManager />} />
              <Route path="/strategies/:strategyId" element={<StrategyDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/backtesting" element={<Backtesting />} />
            </Route>

            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/signals" element={<AdminSignals />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageTransition>
      </Suspense>
    </ErrorBoundary>
  )
}
