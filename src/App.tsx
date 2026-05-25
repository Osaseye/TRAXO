import { Routes, Route, Navigate } from 'react-router'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotPassword from '@/pages/ForgotPassword'
import VerifyOTP from '@/pages/VerifyOTP'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/Dashboard'
import TradingJournal from '@/pages/TradingJournal'
import Profile from '@/pages/Profile'
import StrategyManager from '@/pages/StrategyManager'
import StrategyDetail from '@/pages/StrategyDetail'
import Settings from '@/pages/Settings'
import JournalDateDetail from '@/pages/JournalDateDetail'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-otp" element={<VerifyOTP />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/journal" element={<TradingJournal />} />
      <Route path="/journal/:date" element={<JournalDateDetail />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/strategies" element={<StrategyManager />} />
      <Route path="/strategies/:strategyId" element={<StrategyDetail />} />
      <Route path="/settings" element={<Settings />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
