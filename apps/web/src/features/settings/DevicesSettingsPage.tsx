/**
 * 设备与配对页（阶段九工单 9.1 / ADR D24 / DESIGN §13.J.2.9）：
 * 配对状态（监听地址/鉴权启用态）+ 已配对设备列表（撤销=红字，撤销即断由
 * server 侧完成）+ 添加设备弹窗（QR 为主、6 位码兜底、60s 倒计时）。
 * 非环回绑定须显式配置（红线：缺省 127.0.0.1 无鉴权行为不变），页面如实说明。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Smartphone } from 'lucide-react'
import type { PairCodeDto, PairStatusDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingGroupCard, SettingRow } from './SettingRow'

/** 添加设备弹窗：签发短码 → QR + 6 位码 + 倒计时；过期后可重新签发 */
function PairCodeDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 签发即启用鉴权：通知页面刷新状态 */
  onIssued: () => void
}) {
  const { transport } = useTransport()
  const [pair, setPair] = useState<PairCodeDto | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const issuing = useRef(false)
  // 代际标志：关闭弹窗时递增，使在途签发回调失效（防关闭后回调写状态竞态）
  const generation = useRef(0)

  const issue = useCallback((): void => {
    if (issuing.current) return
    issuing.current = true
    setError(null)
    const gen = ++generation.current
    transport
      .createPairCode()
      .then(async (dto) => {
        // 固定白底：深色主题下 QR 反色不可扫（异步先生成，回写前再校验代际）
        const dataUrl = await QRCode.toDataURL(dto.qr, { width: 208, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        if (generation.current !== gen) return // 已关闭/已被新一轮取代：在途回调失效，不写状态
        setPair(dto)
        setQrDataUrl(dataUrl)
        onIssued()
      })
      .catch((err: unknown) => {
        if (generation.current === gen) setError(errorMessageOf(err))
      })
      .finally(() => {
        if (generation.current === gen) issuing.current = false
      })
  }, [transport, onIssued])

  // 打开即签发；关闭清态并使在途回调失效（复位 issuing，下次打开可立即签发）
  useEffect(() => {
    if (!open) {
      generation.current += 1
      issuing.current = false
      setPair(null)
      setQrDataUrl(null)
      setError(null)
      return
    }
    issue()
  }, [open, issue])

  // 倒计时（1s 粒度；短码 60s 有效）
  useEffect(() => {
    if (!open || pair === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open, pair])

  const remainSec = pair !== null ? Math.max(0, Math.ceil((pair.expiresAt - now) / 1000)) : 0
  const expired = pair !== null && remainSec <= 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加移动设备</DialogTitle>
          <DialogDescription>
            用手机端 Spark 扫码，或手动输入 6 位配对码（60 秒内有效、一次性）
          </DialogDescription>
        </DialogHeader>

        {error !== null ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : pair === null || qrDataUrl === null ? (
          <p className="py-8 text-center text-xs text-muted-foreground">正在生成配对码…</p>
        ) : expired ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-xs text-muted-foreground">配对码已过期</p>
            <Button type="button" variant="outline" onClick={issue}>
              重新生成
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            <img src={qrDataUrl} alt="配对二维码" className="size-52 rounded-md bg-white p-2" />
            <p className="font-mono text-2xl tracking-[0.3em]" aria-label={`配对码 ${pair.code}`}>
              {pair.code}
            </p>
            <p className="text-xs text-muted-foreground">
              {remainSec} 秒后过期 · 兑换后自动失效
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function DevicesSettingsPage() {
  const { transport } = useTransport()
  const [status, setStatus] = useState<PairStatusDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const refresh = useCallback((): void => {
    transport
      .getPairStatus()
      .then(setStatus)
      .catch((err: unknown) => setError(errorMessageOf(err)))
  }, [transport])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function revoke(id: string): Promise<void> {
    setRevoking(id)
    try {
      await transport.revokePairDevice(id)
      refresh()
    } catch (err) {
      setError(errorMessageOf(err))
    } finally {
      setRevoking(null)
    }
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (status === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  return (
    <div className="flex flex-col gap-4">
      <SettingGroupCard>
        <SettingRow
          title="监听地址"
          description={status.loopback ? '仅本机可访问（缺省红线形态）' : '局域网可访问——请确认网络环境可信'}
        >
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {status.host}:{status.port}
          </span>
        </SettingRow>
        <SettingRow
          title="配对鉴权"
          description={
            status.authEnabled
              ? '已启用：远程访问须携带配对 token'
              : '未启用——在下方添加设备后自动启用；非环回监听须先添加设备再重启'
          }
        >
          <span className="shrink-0 text-xs text-muted-foreground">
            {status.authEnabled ? '已启用' : '未启用'}
          </span>
        </SettingRow>
        <SettingRow title="添加设备" description="出示二维码或 6 位配对码，手机端扫码完成配对">
          <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
            <Smartphone />
            添加设备
          </Button>
        </SettingRow>
      </SettingGroupCard>

      {status.devices.length > 0 && (
        <SettingGroupCard>
          {status.devices.map((d) => (
            <SettingRow
              key={d.id}
              title={d.name}
              description={`最近访问 ${new Date(d.lastSeenAt).toLocaleString()}`}
            >
              <button
                type="button"
                onClick={() => void revoke(d.id)}
                disabled={revoking === d.id}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                撤销
              </button>
            </SettingRow>
          ))}
        </SettingGroupCard>
      )}

      <PairCodeDialog open={dialogOpen} onOpenChange={setDialogOpen} onIssued={refresh} />
    </div>
  )
}
