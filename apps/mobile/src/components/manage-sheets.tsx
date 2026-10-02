/**
 * 管理面板 Sheet 族（工单 19.28 批 1）：会话页三件（会话树+分叉 / 检查点+回滚 /
 * 多模型竞答 只读+应用胜者+取消）与设置页四件（信任目录 / 扩展插件 / 语言服务器 /
 * 子代理预设）。数据面 = HttpTransport 九域方法（mobile 全量复用，零协议扩面）；
 * 判定纯函数在 session/manage.ts；文案走 protocol i18n `manage.*`（mobileT）。
 *
 * 纪律：不做乐观更新——Switch/动作成功用返回值或重新拉取回写；失败走 localNotice
 * 人话条（mobileErrorMessageOf 单源）；轮询定时器随卸载清理（teardown 纪律）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import type {
  AgentPresetDto,
  ArenaStatusDto,
  CheckpointDto,
  ExtensionDto,
  LspServerStatusDto,
  SessionId,
  TreeNodeDto,
  TrustStatusDto,
} from '@spark/protocol'
import { KNOWN_LSP_SERVERS } from '@spark/protocol'
import { mobileErrorMessageOf, miniT } from '../i18n'
import { useTheme } from '../store/theme-store'
import type { Transport } from '@spark/protocol'
import { agentEnabledOf, contenderLineOf, treeRowsOf, updateDisabledAgents } from '../session/manage'
import { Card, Hairline, SheetScreen } from './ui'

type Rest = () => Transport | null

/** 共用拉取：alive 标志 + 错误收口（不吞异常，错误给人话条）；reload 计数触发重拉 */
function useRemote<T>(rest: Rest, fetcher: (t: Transport) => Promise<T>, reload: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    const transport = rest()
    if (transport === null) {
      setError('未配置服务器：请先在设置页完成配对')
      setLoaded(true)
      return () => undefined
    }
    fetcher(transport)
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(mobileErrorMessageOf(err))
        setLoaded(true)
      })
    return () => {
      alive = false
    }
    // fetcher 由调用方 useCallback 稳定；rest 变化随 reload 一起进来
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])
  return { data, error, loaded, setData }
}

function SheetBody({ loaded, error, children }: { loaded: boolean; error: string | null; children: React.ReactNode }) {
  const t = useTheme()
  if (error !== null) {
    return <Text style={[s.notice, { color: t.sparkErr }]}>{error}</Text>
  }
  if (!loaded) return <ActivityIndicator style={s.pager} color={t.mutedForeground} />
  return <>{children}</>
}

function ListRow({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <View style={[s.row, { borderBottomColor: t.border }]}>
      {children}
    </View>
  )
}

/** 动作行尾的文本钮（分叉/回滚/应用/安装——与 mobile 现有细条 action 同形态） */
function RowAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme()
  return (
    <TouchableOpacity hitSlop={8} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={{ color: danger === true ? t.sparkErr : t.sparkAccent, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  )
}

// ---------- 会话页三件 ----------

export function SessionTreeSheet({
  sid,
  rest,
  onClose,
  onOpenSession,
}: {
  sid: SessionId
  rest: Rest
  onClose: () => void
  /** 点 fork 子会话行 → 跳转（先关 Sheet 再导航；树行只带 id/title，导航参数够用） */
  onOpenSession: (sessionId: SessionId, title: string) => void
}) {
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loaded } = useRemote<TreeNodeDto[]>(rest, (t) => t.getTree(sid), reload)
  const rows = data !== null ? treeRowsOf(data) : []

  const fork = useCallback(
    (eventId: string) => {
      const transport = rest()
      if (transport === null || busy) return
      setBusy(true)
      void transport
        .fork(sid, eventId)
        .then((dto) => {
          setNotice(miniT('manage.forked'))
          setReload((v) => v + 1)
          onOpenSession(dto.id, dto.title)
        })
        .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
        .finally(() => setBusy(false))
    },
    [rest, sid, busy, onOpenSession],
  )

  return (
    <SheetScreen title={miniT('manage.sessionTree')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.mutedForeground }]}>{notice}</Text>}
          {rows.length === 0 ? (
            <Text style={[s.notice, { color: t.mutedForeground }]}>{miniT('manage.empty')}</Text>
          ) : (
            <Card>
              {rows.map((r, i) => (
                <View key={r.node.id}>
                  {i > 0 ? <Hairline inset={12} /> : null}
                  <View style={[s.row, { borderBottomColor: t.border, paddingLeft: 12 + r.depth * 16 }]}>
                    <Text numberOfLines={1} style={[s.rowTitle, { color: t.foreground }]}>
                      {r.node.label}
                    </Text>
                    <RowAction label={miniT('manage.fork')} onPress={() => fork(r.node.id)} />
                  </View>
                  {r.node.forks.map((f) => (
                    <TouchableOpacity
                      key={f.sessionId}
                      style={[s.row, { borderBottomColor: t.border, paddingLeft: 12 + (r.depth + 1) * 16 }]}
                      onPress={() => {
                        onClose()
                        onOpenSession(f.sessionId, f.title)
                      }}
                    >
                      <Text numberOfLines={1} style={[s.rowTitle, { color: t.mutedForeground }]}>
                        ↳ {f.title !== '' ? f.title : '新会话'}（{f.status}）
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </Card>
          )}
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

export function CheckpointsSheet({
  sid,
  rest,
  onClose,
  onRolledBack,
}: {
  sid: SessionId
  rest: Rest
  onClose: () => void
  /** 回滚成功 → 父级重建会话控制器（seq 已回退，只能全量重放） */
  onRolledBack: () => void
}) {
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loaded } = useRemote<CheckpointDto[]>(rest, (t) => t.listCheckpoints(sid), reload)

  const rollback = useCallback(
    (checkpointId: string) => {
      const transport = rest()
      if (transport === null || busy) return
      setBusy(true)
      void transport
        .rollbackCheckpoint(sid, checkpointId)
        .then(() => {
          setNotice(miniT('manage.rolledBack'))
          setReload((v) => v + 1)
          onRolledBack()
        })
        .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
        .finally(() => setBusy(false))
    },
    [rest, sid, busy, onRolledBack],
  )

  return (
    <SheetScreen title={miniT('manage.checkpoints')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.mutedForeground }]}>{notice}</Text>}
          {data === null || data.length === 0 ? (
            <Text style={[s.notice, { color: t.mutedForeground }]}>{miniT('manage.empty')}</Text>
          ) : (
            <Card>
              {[...data].reverse().map((c, i) => (
                <View key={c.checkpointId}>
                  {i > 0 ? <Hairline inset={12} /> : null}
                  <ListRow>
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: t.foreground }]}>{fmtTime(c.createdAt)}</Text>
                      <Text style={[s.rowSub, { color: t.mutedForeground }]}>
                        {c.files.length} 个文件快照
                      </Text>
                    </View>
                    <RowAction label={miniT('manage.rollback')} onPress={() => rollback(c.checkpointId)} />
                  </ListRow>
                </View>
              ))}
            </Card>
          )}
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

export function ArenaSheet({ sid, rest, onClose }: { sid: SessionId; rest: Rest; onClose: () => void }) {
  const t = useTheme()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const { data, error, loaded } = useRemote<ArenaStatusDto | null>(rest, (tr) => tr.getArena(sid), reload)
  const running = data?.status === 'running'
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // running 时 2s 轮询（web ArenaCard 同周期）；关闭/结束即停
  useEffect(() => {
    if (!running) return () => undefined
    timer.current = setInterval(() => setReload((v) => v + 1), 2000)
    return () => {
      if (timer.current !== null) clearInterval(timer.current)
      timer.current = null
    }
  }, [running, reload])

  const act = useCallback(
    (fn: (tr: Transport) => Promise<void>, okText: string) => {
      const transport = rest()
      if (transport === null || busy) return
      setBusy(true)
      void fn(transport)
        .then(() => {
          setNotice(okText)
          setReload((v) => v + 1)
        })
        .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
        .finally(() => setBusy(false))
    },
    [rest, busy],
  )

  return (
    <SheetScreen title={miniT('manage.arena')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.mutedForeground }]}>{notice}</Text>}
          {data === null ? (
            <Text style={[s.notice, { color: t.mutedForeground }]}>{miniT('manage.empty')}</Text>
          ) : (
            <Card style={{ padding: 12 }}>
              <Text style={[s.rowSub, { color: t.mutedForeground }]}>
                {data.status} · {data.prompt}
              </Text>
              {data.contenders.map((c) => (
                <View key={c.sessionId} style={[s.row, { borderBottomColor: t.border }]}>
                  <View style={s.rowMain}>
                    <Text numberOfLines={1} style={[s.rowTitle, { color: c.sessionId === data.winner ? t.sparkAccent : t.foreground }]}>
                      {c.sessionId === data.winner ? '★ ' : ''}
                      {contenderLineOf(c)}
                    </Text>
                  </View>
                  {data.status === 'completed' && data.applied === null && c.sessionId !== data.winner && (
                    <RowAction
                      label={miniT('manage.applyWinner')}
                      onPress={() =>
                        act((tr) => tr.applyArenaWinner(sid, c.sessionId), miniT('manage.applied'))
                      }
                    />
                  )}
                </View>
              ))}
              {data.applied !== null && (
                <Text style={[s.rowSub, { color: t.mutedForeground, marginTop: 8 }]}>
                  已应用：{data.applied.files.length} 个文件
                  {data.applied.skippedDeletions.length > 0
                    ? `（跳过删除类 ${data.applied.skippedDeletions.length}）`
                    : ''}
                </Text>
              )}
              {running && (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                  <RowAction
                    label={miniT('manage.cancelArena')}
                    danger
                    onPress={() => act((tr) => tr.cancelArena(sid), miniT('manage.empty'))}
                  />
                </View>
              )}
              {running && <ActivityIndicator style={s.pager} color={t.mutedForeground} />}
            </Card>
          )}
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

// ---------- 设置页四件 ----------

export function TrustSheet({ rest, onClose }: { rest: Rest; onClose: () => void }) {
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const { data, error, loaded } = useRemote<TrustStatusDto>(rest, (t) => t.getTrust(), reload)
  const toggle = (path: string, trusted: boolean): void => {
    const transport = rest()
    if (transport === null) return
    void transport
      .setTrust(path, trusted ? 'trusted' : 'untrusted')
      .then(() => setReload((v) => v + 1))
      .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
  }
  return (
    <SheetScreen title={miniT('manage.trustDirs')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.sparkErr }]}>{notice}</Text>}
          {data === null || data.folders.length === 0 ? (
            <Text style={[s.notice, { color: t.mutedForeground }]}>{miniT('manage.empty')}</Text>
          ) : (
            <Card>
              {data.folders.map((f, i) => (
                <View key={f.path}>
                  {i > 0 ? <Hairline inset={12} /> : null}
                  <ListRow>
                    <Text numberOfLines={1} style={[s.rowTitle, { color: t.foreground }]}>
                      {f.path}
                    </Text>
                    <Switch
                      value={f.trust === 'trusted'}
                      onValueChange={(v) => toggle(f.path, v)}
                      accessibilityLabel={`${miniT('manage.trustDirs')} ${f.path}`}
                    />
                  </ListRow>
                </View>
              ))}
            </Card>
          )}
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

export function ExtensionsSheet({ rest, onClose }: { rest: Rest; onClose: () => void }) {
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const { data, error, loaded } = useRemote<ExtensionDto[]>(rest, (t) => t.listExtensions(), reload)
  const toggle = (id: string, enabled: boolean): void => {
    const transport = rest()
    if (transport === null) return
    void transport
      .setExtensionEnabled(id, enabled)
      .then(() => setReload((v) => v + 1))
      .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
  }
  return (
    <SheetScreen title={miniT('manage.extensions')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.sparkErr }]}>{notice}</Text>}
          {data === null || data.length === 0 ? (
            <Text style={[s.notice, { color: t.mutedForeground }]}>{miniT('manage.empty')}</Text>
          ) : (
            <Card>
              {data.map((x, i) => (
                <View key={x.id}>
                  {i > 0 ? <Hairline inset={12} /> : null}
                  <ListRow>
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: t.foreground }]}>{x.id}</Text>
                      <Text numberOfLines={1} style={[s.rowSub, { color: t.mutedForeground }]}>
                        {x.path}
                      </Text>
                    </View>
                    <Switch value={x.enabled} onValueChange={(v) => toggle(x.id, v)} accessibilityLabel={`${x.id} 启停`} />
                  </ListRow>
                </View>
              ))}
            </Card>
          )}
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

export function LspSheet({ rest, onClose }: { rest: Rest; onClose: () => void }) {
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loaded } = useRemote<LspServerStatusDto[]>(rest, (t) => t.listLspServers(), reload)

  const install = (id: string): void => {
    const transport = rest()
    if (transport === null || busy) return
    setBusy(true)
    void transport
      .installLspServer(id)
      .then(() => {
        setNotice(miniT('manage.installed'))
        setReload((v) => v + 1)
      })
      .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
      .finally(() => setBusy(false))
  }

  return (
    <SheetScreen title={miniT('manage.lspServers')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.mutedForeground }]}>{notice}</Text>}
          {/* 连接状态区（GET /api/lsp 只读；引擎惰性拉起，未用过即空表） */}
          {data !== null && data.length > 0 && (
            <Card>
              {data.map((srv, i) => (
                <View key={srv.language}>
                  {i > 0 ? <Hairline inset={12} /> : null}
                  <ListRow>
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: t.foreground }]}>{srv.language}</Text>
                      <Text style={[s.rowSub, { color: srv.error !== undefined ? t.sparkErr : t.mutedForeground }]}>
                        {srv.error !== undefined
                          ? srv.error
                          : `${srv.connected ? '已连接' : '未连接'} · ${srv.errors} 错误 / ${srv.warnings} 警告`}
                      </Text>
                    </View>
                    <View style={[s.dot, { backgroundColor: srv.connected ? t.sparkOk : t.mutedForeground }]} />
                  </ListRow>
                </View>
              ))}
            </Card>
          )}
          {/* 安装区（web 同口径：内置清单全列，服务端已装时幂等跳过） */}
          <Card>
            {KNOWN_LSP_SERVERS.map((k, i) => (
              <View key={k.id}>
                {i > 0 ? <Hairline inset={12} /> : null}
                <ListRow>
                  <Text style={[s.rowTitle, { color: t.foreground }]}>
                    {k.language}（{k.id}）
                  </Text>
                  <RowAction label={miniT('manage.install')} onPress={() => install(k.id)} />
                </ListRow>
              </View>
            ))}
          </Card>
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

export function AgentsSheet({ rest, onClose }: { rest: Rest; onClose: () => void }) {
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const { data, error, loaded } = useRemote<{ presets: AgentPresetDto[]; disabled: string[] }>(
    rest,
    async (t) => {
      const [presets, settings] = await Promise.all([t.listAgentPresets(), t.getSettings()])
      return { presets, disabled: settings.agents?.disabledAgents ?? [] }
    },
    reload,
  )
  const toggle = (name: string, enable: boolean): void => {
    const transport = rest()
    if (transport === null) return
    const current = data?.disabled ?? []
    const next = updateDisabledAgents(current, name, enable)
    void transport
      .updateSettings({ agents: { disabledAgents: next } })
      .then(() => setReload((v) => v + 1))
      .catch((err: unknown) => setNotice(mobileErrorMessageOf(err)))
  }
  const disabledNames = new Set(data?.disabled ?? [])
  return (
    <SheetScreen title={miniT('manage.agentPresets')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.body}>
        <SheetBody loaded={loaded} error={error}>
          {notice !== null && <Text style={[s.notice, { color: t.sparkErr }]}>{notice}</Text>}
          {data === null || data.presets.length === 0 ? (
            <Text style={[s.notice, { color: t.mutedForeground }]}>{miniT('manage.empty')}</Text>
          ) : (
            <Card>
              {data.presets.map((p, i) => (
                <View key={p.name}>
                  {i > 0 ? <Hairline inset={12} /> : null}
                  <ListRow>
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: t.foreground }]}>{p.name}</Text>
                      {p.title !== undefined && (
                        <Text style={[s.rowSub, { color: t.mutedForeground }]}>{p.title}</Text>
                      )}
                    </View>
                    <Switch
                      value={agentEnabledOf(p, disabledNames)}
                      onValueChange={(v) => toggle(p.name, v)}
                      accessibilityLabel={`${miniT('manage.agentPresets')} ${p.name}`}
                    />
                  </ListRow>
                </View>
              ))}
            </Card>
          )}
        </SheetBody>
      </ScrollView>
    </SheetScreen>
  )
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const s = StyleSheet.create({
  body: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
  },
  rowSub: {
    fontSize: 12,
  },
  notice: {
    fontSize: 13,
  },
  pager: {
    marginVertical: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
