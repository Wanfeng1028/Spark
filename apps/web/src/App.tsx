import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { WelcomePage } from '@/routes/WelcomePage'
import { SessionPage } from '@/routes/SessionPage'

/** 路由与 AppShell 组装（doc/02 §6.1）；/ → /welcome（最近会话跳转是阶段二） */
export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
      </Routes>
    </AppShell>
  )
}
