import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  showDetails: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetails: false }

  static getDerivedStateFromError(error: Error): State {
    return { error, showDetails: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TeamSpeakWeb] render error', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ error: null, showDetails: false })
  }

  render() {
    if (this.state.error) {
      const message = this.state.error.message || '未知错误'
      // Full stack only behind collapsible details — never dumped on screen in prod.
      const details = this.state.error.stack || message
      return (
        <div
          style={{
            padding: 24,
            color: '#1d1d1f',
            background: '#f5f5f7',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: 18 }}>界面加载失败</h1>
          <p style={{ color: '#3a3a3c', fontSize: 14, marginTop: 8 }}>{message}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '8px 14px',
                background: '#1d1d1f',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              重新加载
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '8px 14px',
                background: '#fff',
                color: '#1d1d1f',
                border: '1px solid rgba(15,20,30,0.15)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              重试
            </button>
          </div>
          <details
            style={{ marginTop: 16 }}
            open={this.state.showDetails}
            onToggle={(e) => {
              this.setState({ showDetails: (e.target as HTMLDetailsElement).open })
            }}
          >
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#7a7a7f' }}>
              技术详情
            </summary>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                color: '#d64545',
                fontSize: 12,
                marginTop: 8,
              }}
            >
              {details}
            </pre>
          </details>
          <p style={{ color: '#7a7a7f', fontSize: 13, marginTop: 16 }}>
            请确认通过 <code>npm start</code> 打开 http://127.0.0.1:8080 ，而不是直接打开源码
            index.html。
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
