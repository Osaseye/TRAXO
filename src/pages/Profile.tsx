import { useState } from 'react'
import { ShieldCheck, UserRound } from 'lucide-react'
import { DesktopWorkspaceNav, MobileFloatingWorkspaceNav } from '@/components/layout/WorkspaceNav'

export default function Profile() {
  const [twoFaEnabled, setTwoFaEnabled] = useState(false)

  return (
    <div className="min-h-screen bg-[#070709] text-white pb-24 lg:pb-8">
      <header className="h-14 border-b border-white/[0.05] bg-[#070709]/95 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
        <h1 className="text-[14px] font-semibold">Profile</h1>
        <DesktopWorkspaceNav />
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5 sm:p-6 space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Identity</p>
            <h2 className="text-[1.25rem] font-bold mt-2">Personal Information</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[12px] text-[#94a3b8]">First name
              <input className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" defaultValue="Avery" />
            </label>
            <label className="text-[12px] text-[#94a3b8]">Last name
              <input className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" defaultValue="Walker" />
            </label>
            <label className="text-[12px] text-[#94a3b8] sm:col-span-2">Display name
              <input className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" defaultValue="AveryW" />
            </label>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#64748b]">Contact</p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-[12px] text-[#94a3b8]">Email
                <input className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" defaultValue="avery@email.com" />
              </label>
              <label className="text-[12px] text-[#94a3b8]">Phone
                <input className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" defaultValue="+1 555 0182" />
              </label>
              <label className="text-[12px] text-[#94a3b8] sm:col-span-2">Country
                <input className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" defaultValue="United States" />
              </label>
            </div>
          </div>

          <button className="h-10 px-4 rounded-lg bg-white text-[#111827] text-[12px] font-semibold">Save profile changes</button>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#93c5fd]" />
              <p className="text-[13px] font-semibold">Account Security</p>
            </div>
            <p className="text-[12px] text-[#94a3b8] mt-2">Keep your account protected with strong credentials and second-factor verification.</p>

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0b0f17] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold">Two-Factor Authentication</p>
                  <p className="text-[11px] text-[#94a3b8] mt-1">Authenticator app based verification on every login.</p>
                </div>
                <button
                  onClick={() => setTwoFaEnabled((v) => !v)}
                  className={`h-8 px-3 rounded-lg text-[11px] font-semibold ${twoFaEnabled ? 'bg-[#14532d] text-[#bbf7d0]' : 'bg-[#1e293b] text-[#cbd5e1]'}`}
                >
                  {twoFaEnabled ? 'Enabled' : 'Enable'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] p-5">
            <div className="flex items-center gap-2">
              <UserRound size={15} className="text-[#cbd5e1]" />
              <p className="text-[13px] font-semibold">Change Password</p>
            </div>
            <div className="mt-3 space-y-2.5">
              <label className="text-[12px] text-[#94a3b8]">Current password
                <input type="password" className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" />
              </label>
              <label className="text-[12px] text-[#94a3b8]">New password
                <input type="password" className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" />
              </label>
              <label className="text-[12px] text-[#94a3b8]">Confirm new password
                <input type="password" className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-[#0b0f17] px-3 text-[13px]" />
              </label>
            </div>
            <button className="mt-4 h-10 px-4 rounded-lg border border-white/[0.18] text-[12px] font-semibold text-[#e2e8f0]">
              Update password
            </button>
          </div>
        </section>
      </main>

      <MobileFloatingWorkspaceNav />
    </div>
  )
}
