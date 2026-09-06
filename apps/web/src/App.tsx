import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { TransportProvider, useTransport } from '@/transports/context'
import { WelcomePage } from '@/routes/WelcomePage'
import { SessionPage } from '@/routes/SessionPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { SearchPage } from '@/routes/SearchPage'
import { AutomationPage } from '@/features/automation/AutomationPage'
import { OnboardingPage, shouldOnboard } from '@/routes/OnboardingPage'

/** 路由与 AppShell 组装（doc/02 §6.1）；/ → /welcome（最近会话跳转是阶段二）；
 * /settings/:page 设置中心（工单 6.4）；/automation 自动化页（工单 7.6，§13.F.3）；
 * /search 会话全文搜索页（工单 7.13） */
export function App() {
  return (
    <TransportProvider>
      <FirstRunRedirect />
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/settings/:page" element={<SettingsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Routes>
      </AppShell>
    </TransportProvider>
  )
}

/** 首启自动引导（工单 12.8）：无完成标记且服务端无已配置供应商 → /onboarding；
 * 每次挂载最多检查一次，检查期间不导航（fail-soft：server 未就绪不弹）。 */
function FirstRunRedirect() {
  const navigate = useNavigate()
  const { transport } = useTransport()
  useEffect(() => {
    let cancelled = false
    void shouldOnboard(() => transport.listModels()).then((need) => {
      if (!cancelled && need && location.pathname !== '/onboarding') void navigate('/onboarding')
    })
    return () => {
      cancelled = true
    }
  }, [navigate, transport])
  return null
}
