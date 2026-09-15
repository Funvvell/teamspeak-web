import { useEffect } from 'react'
import type { ConnectionTab } from '../views/types'

interface GatewayConfig {
  defaultHost?: string
  defaultPort?: string
  defaultNickname?: string
  authRequired?: boolean
  musicBotUrl?: string
}

/** One-shot /config bootstrap: music bot URL, auth flag, default host/port/nick. */
export function useGatewayConfig(handlers: {
  setMusicBotUrl: (v: string) => void
  setAuthRequired: (v: boolean) => void
  setTabs: React.Dispatch<React.SetStateAction<ConnectionTab[]>>
}) {
  const { setMusicBotUrl, setAuthRequired, setTabs } = handlers
  useEffect(() => {
    void fetch('/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: GatewayConfig | null) => {
        if (!cfg) return
        if (cfg.musicBotUrl) setMusicBotUrl(cfg.musicBotUrl)
        if (cfg.authRequired) setAuthRequired(true)
        setTabs((list) =>
          list.map((t, i) =>
            i === 0 && !t.host && cfg.defaultHost
              ? {
                  ...t,
                  host: cfg.defaultHost || t.host,
                  port: cfg.defaultPort || t.port,
                  nickname: cfg.defaultNickname || t.nickname,
                }
              : t,
          ),
        )
      })
      .catch(() => {})
  }, [setMusicBotUrl, setAuthRequired, setTabs])
}
