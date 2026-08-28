import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { TransportProvider } from '@/transports/context'
import { WelcomePage } from '@/routes/WelcomePage'
import { SessionPage } from '@/routes/SessionPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { SearchPage } from '@/routes/SearchPage'
import { AutomationPage } from '@/features/automation/AutomationPage'

/** 路由与 AppShell 组装（doc/02 §6.1）；/ → /welcome（最近会话跳转是阶段二）；
 * /settings/:page 设置中心（工单 6.4）；/automation 自动化页（工单 7.6，§13.F.3）；
 * /search 会话全文搜索页（工单 7.13） */
export function App() {
  return (
    <TransportProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/settings/:page" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </TransportProvider>
  )
}
