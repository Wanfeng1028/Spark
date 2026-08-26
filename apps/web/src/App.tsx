import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { TransportProvider } from '@/transports/context'
import { WelcomePage } from '@/routes/WelcomePage'
import { SessionPage } from '@/routes/SessionPage'
import { SettingsPage } from '@/routes/SettingsPage'

/** 路由与 AppShell 组装（doc/02 §6.1）；/ → /welcome（最近会话跳转是阶段二）；
 * /settings/:page 设置中心（工单 6.4，左栏切设置导航） */
export function App() {
  return (
    <TransportProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="/settings/:page" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </TransportProvider>
  )
}
