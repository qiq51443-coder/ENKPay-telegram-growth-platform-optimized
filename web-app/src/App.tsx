import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import './App.css'

type TabKey = 'trading' | 'auction' | 'products' | 'charity' | 'profile'
type AuthMode = 'login' | 'register'
type Route =
  | { view: 'auth'; mode: AuthMode }
  | { view: 'app'; tab: TabKey }
  | { view: 'deposit' }
  | { view: 'withdraw' }

type ApiResult<T> = { success?: boolean; data?: T; user?: WebUser; message?: string; error?: string; [key: string]: any }

interface WebUser {
  id: string
  email: string
  unique_id: string
  wallet_balance: number
  reward_balance: number
  nft_balance: number
  red_packet_balance: number
  frozen_balance: number
  tradable_balance: number
  total_recharged: number
  total_withdrawn: number
  email_verified: boolean
  register_type: string
  wallet_tip_message?: string
}

interface TradingPair {
  id: number
  symbol: string
  display_name: string
  current_price?: number
  price_change_24h?: number
}

interface AuctionItem {
  id: string
  title: string
  product_value?: number
  per_person_cost?: number
  current_participants?: number
  image_url?: string
}

interface ProductItem {
  id: string
  name: string
  price?: number
  annual_yield?: number
  duration_days?: number
  image_url?: string
}

interface CharityItem {
  id: string
  title: string
  goal_amount?: number
  raised_amount?: number
  progress_override?: number
  image_url?: string
}

interface WalletNetwork {
  id: number
  network_name: string
  network_display: string
  chain_name: string
  currency?: string
  min_deposit_amount?: number
}

interface WalletTransaction {
  id: string
  type: string
  amount: number
  status: string
  created_at: string
  order_id?: string
  to_address?: string
  tx_hash?: string
  network_display?: string
}

const WEB_TOKEN_KEY = 'enkpay_web_token'
const API_BASE = '/api'
const TABS: Array<{ key: TabKey; label: string; icon: string; description: string }> = [
  { key: 'trading', label: '即时交易', icon: '📈', description: '查看当前开放的交易币对与最新价格。' },
  { key: 'auction', label: '夺宝', icon: '🎰', description: '浏览当前进行中的夺宝项目。' },
  { key: 'products', label: '定期产品', icon: '⏱', description: '查看平台当前开放的定期/NFT 产品。' },
  { key: 'charity', label: '公益活动', icon: '❤️', description: '了解平台公益项目与进度。' },
  { key: 'profile', label: '个人中心', icon: '👤', description: '管理网页账户、提现密码与钱包操作。' },
]

const getStoredToken = () => {
  try {
    return localStorage.getItem(WEB_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

const setStoredToken = (token: string) => {
  try {
    localStorage.setItem(WEB_TOKEN_KEY, token)
  } catch {}
}

const clearStoredToken = () => {
  try {
    localStorage.removeItem(WEB_TOKEN_KEY)
  } catch {}
}

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash.startsWith('app/')) {
    const tab = hash.slice(4) as TabKey
    if (TABS.some((item) => item.key === tab)) return { view: 'app', tab }
  }
  if (hash === 'deposit') return { view: 'deposit' }
  if (hash === 'withdraw') return { view: 'withdraw' }
  if (hash === 'register') return { view: 'auth', mode: 'register' }
  return { view: 'auth', mode: 'login' }
}

function navigateTo(route: Route) {
  if (route.view === 'auth') window.location.hash = `/${route.mode}`
  if (route.view === 'app') window.location.hash = `/app/${route.tab}`
  if (route.view === 'deposit') window.location.hash = '/deposit'
  if (route.view === 'withdraw') window.location.hash = '/withdraw'
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', 'Bearer ' + token)

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || '请求失败')
  }
  return data as T
}

function formatMoney(value?: number) {
  return `${Number(value || 0).toFixed(2)} USDT`
}

function formatDate(value?: string) {
  if (!value) return '--'
  return new Date(value).toLocaleString()
}

function cardTitle(route: Route) {
  if (route.view === 'deposit') return '独立充值页'
  if (route.view === 'withdraw') return '独立提现页'
  if (route.view === 'auth') return route.mode === 'register' ? '邮箱注册' : '邮箱登录'
  return TABS.find((tab) => tab.key === route.tab)?.label || 'ENKPay'
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute())
  const [token, setToken] = useState(getStoredToken())
  const [user, setUser] = useState<WebUser | null>(null)
  const [loadingUser, setLoadingUser] = useState(Boolean(getStoredToken()))
  const [globalError, setGlobalError] = useState('')

  const [pairs, setPairs] = useState<TradingPair[]>([])
  const [pairsLoading, setPairsLoading] = useState(false)
  const [auctions, setAuctions] = useState<AuctionItem[]>([])
  const [auctionsLoading, setAuctionsLoading] = useState(false)
  const [products, setProducts] = useState<ProductItem[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [charity, setCharity] = useState<CharityItem[]>([])
  const [charityLoading, setCharityLoading] = useState(false)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [hasWithdrawPassword, setHasWithdrawPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [depositNetworks, setDepositNetworks] = useState<WalletNetwork[]>([])
  const [depositNetworksLoading, setDepositNetworksLoading] = useState(false)
  const [selectedDepositNetwork, setSelectedDepositNetwork] = useState('')
  const [depositAddress, setDepositAddress] = useState('')
  const [depositQr, setDepositQr] = useState('')
  const [depositLoading, setDepositLoading] = useState(false)

  const [withdrawNetworks, setWithdrawNetworks] = useState<WalletNetwork[]>([])
  const [withdrawNetworksLoading, setWithdrawNetworksLoading] = useState(false)
  const [withdrawForm, setWithdrawForm] = useState({
    network_id: '',
    amount: '',
    to_address: '',
    withdraw_password: '',
  })
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)

  const [authForms, setAuthForms] = useState({
    loginEmail: '',
    loginPassword: '',
    registerEmail: '',
    registerCode: '',
    registerPassword: '',
    registerConfirmPassword: '',
    registerAgreed: false,
  })
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [sendCodeLoading, setSendCodeLoading] = useState(false)
  const [sendCodeCountdown, setSendCodeCountdown] = useState(0)
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageType, setAuthMessageType] = useState<'success' | 'error' | ''>('')
  const [showLoginPwd, setShowLoginPwd] = useState(false)
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [showRegConfirmPwd, setShowRegConfirmPwd] = useState(false)
  const [brandName, setBrandName] = useState('ENKPay')
  const [withdrawPasswordForm, setWithdrawPasswordForm] = useState({ password: '', confirmPassword: '' })

  const activeTab = route.view === 'app' ? route.tab : 'trading'

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) {
      navigateTo(token ? { view: 'app', tab: 'trading' } : { view: 'auth', mode: 'login' })
    }
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [token])

  useEffect(() => {
    if (!token && route.view !== 'auth') {
      navigateTo({ view: 'auth', mode: 'login' })
    }
  }, [route, token])

  useEffect(() => {
    if (!token) {
      setUser(null)
      setLoadingUser(false)
      return
    }
    setLoadingUser(true)
    apiRequest<ApiResult<WebUser>>('/web/auth/me', {}, token)
      .then((result) => {
        setUser(result.user || null)
        setGlobalError('')
      })
      .catch((error: Error) => {
        clearStoredToken()
        setToken('')
        setUser(null)
        setGlobalError(error.message)
        navigateTo({ view: 'auth', mode: 'login' })
      })
      .finally(() => setLoadingUser(false))
  }, [token])

  useEffect(() => {
    if (!sendCodeCountdown) return
    const timer = window.setTimeout(() => setSendCodeCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [sendCodeCountdown])

  useEffect(() => {
    fetch('/api/landing/config')
      .then((r) => r.json())
      .then((data) => {
        if (data?.brand?.name) setBrandName(data.brand.name)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'trading' && pairs.length === 0) {
      setPairsLoading(true)
      apiRequest<ApiResult<TradingPair[]>>('/trading/pairs')
        .then((result) => setPairs(result.data || []))
        .finally(() => setPairsLoading(false))
    }
  }, [route, pairs.length])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'auction' && auctions.length === 0) {
      setAuctionsLoading(true)
      apiRequest<ApiResult<AuctionItem[]>>('/auctions?status=active&limit=6')
        .then((result) => setAuctions(result.data || []))
        .finally(() => setAuctionsLoading(false))
    }
  }, [route, auctions.length])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'products' && products.length === 0) {
      setProductsLoading(true)
      apiRequest<ApiResult<ProductItem[]>>('/nft/products?status=active&limit=6')
        .then((result) => setProducts(result.data || []))
        .finally(() => setProductsLoading(false))
    }
  }, [route, products.length])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'charity' && charity.length === 0) {
      setCharityLoading(true)
      apiRequest<ApiResult<CharityItem[]>>('/charity/projects?limit=6')
        .then((result) => setCharity(result.data || []))
        .finally(() => setCharityLoading(false))
    }
  }, [route, charity.length])

  useEffect(() => {
    if (!token || route.view !== 'app' || route.tab !== 'profile') return

    setTransactionsLoading(true)
    setPasswordLoading(true)
    Promise.all([
      apiRequest<ApiResult<WalletTransaction[]>>('/web/wallet/transactions?limit=8', {}, token),
      apiRequest<{ has_password: boolean }>('/web/wallet/has-withdraw-password', {}, token),
    ])
      .then(([txResult, passwordResult]) => {
        setTransactions(txResult.data || [])
        setHasWithdrawPassword(Boolean(passwordResult.has_password))
      })
      .catch((error: Error) => setGlobalError(error.message))
      .finally(() => {
        setTransactionsLoading(false)
        setPasswordLoading(false)
      })
  }, [route, token])

  useEffect(() => {
    if (!token || route.view !== 'deposit') return
    setDepositNetworksLoading(true)
    apiRequest<ApiResult<WalletNetwork[]>>('/web/wallet/networks', {}, token)
      .then((result) => {
        const list = result.data || []
        setDepositNetworks(list)
        if (!selectedDepositNetwork && list[0]) {
          setSelectedDepositNetwork(String(list[0].id))
        }
      })
      .finally(() => setDepositNetworksLoading(false))
  }, [route, token, selectedDepositNetwork])

  useEffect(() => {
    if (!token || route.view !== 'deposit' || !selectedDepositNetwork) return
    setDepositLoading(true)
    apiRequest<ApiResult<{ address: string; qr_text: string }>>(`/web/wallet/deposit-address?network_id=${selectedDepositNetwork}`, {}, token)
      .then(async (result) => {
        const address = result.data?.address || ''
        setDepositAddress(address)
        if (address) {
          const qr = await QRCode.toDataURL(result.data?.qr_text || address, { margin: 1, width: 220 })
          setDepositQr(qr)
        } else {
          setDepositQr('')
        }
      })
      .catch((error: Error) => {
        setDepositAddress('')
        setDepositQr('')
        setGlobalError(error.message)
      })
      .finally(() => setDepositLoading(false))
  }, [route, token, selectedDepositNetwork])

  useEffect(() => {
    if (!token || route.view !== 'withdraw') return
    setWithdrawNetworksLoading(true)
    Promise.all([
      apiRequest<ApiResult<WalletNetwork[]>>('/web/wallet/networks', {}, token),
      apiRequest<{ has_password: boolean }>('/web/wallet/has-withdraw-password', {}, token),
    ])
      .then(([networkResult, passwordResult]) => {
        const list = networkResult.data || []
        setWithdrawNetworks(list)
        setHasWithdrawPassword(Boolean(passwordResult.has_password))
        if (!withdrawForm.network_id && list[0]) {
          setWithdrawForm((current) => ({ ...current, network_id: String(list[0].id) }))
        }
      })
      .catch((error: Error) => setGlobalError(error.message))
      .finally(() => setWithdrawNetworksLoading(false))
  }, [route, token, withdrawForm.network_id])

  const summaryCards = useMemo(() => {
    if (!user) return []
    return [
      { label: '可用余额', value: formatMoney(user.wallet_balance) },
      { label: '冻结金额', value: formatMoney(user.frozen_balance) },
      { label: '累计充值', value: formatMoney(user.total_recharged) },
      { label: '累计提现', value: formatMoney(user.total_withdrawn) },
    ]
  }, [user])

  const handleAuthChange = (key: keyof typeof authForms, value: string | boolean) => {
    setAuthForms((current) => ({ ...current, [key]: value }))
  }

  const setSuccessMsg = (msg: string) => { setAuthMessage(msg); setAuthMessageType('success') }
  const setErrorMsg = (msg: string) => { setAuthMessage(msg); setAuthMessageType('error') }

  const handleSendCode = async () => {
    if (!authForms.registerEmail) {
      setErrorMsg('请先输入邮箱地址')
      return
    }
    setSendCodeLoading(true)
    setAuthMessage('')
    setAuthMessageType('')
    try {
      const result = await apiRequest<ApiResult<null>>('/web/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: authForms.registerEmail }),
      })
      setSuccessMsg(result.message || '验证码已发送')
      setSendCodeCountdown(60)
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setSendCodeLoading(false)
    }
  }

  const handleRegister = async () => {
    // Front-end validation before sending to API
    if (!authForms.registerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForms.registerEmail)) {
      setErrorMsg('请输入有效的邮箱地址')
      return
    }
    if (!authForms.registerCode || !/^\d{6}$/.test(authForms.registerCode)) {
      setErrorMsg('请输入 6 位数字验证码')
      return
    }
    if (authForms.registerPassword.length < 8) {
      setErrorMsg('密码至少需要 8 位')
      return
    }
    if (authForms.registerPassword !== authForms.registerConfirmPassword) {
      setErrorMsg('两次输入的密码不一致')
      return
    }
    if (!authForms.registerAgreed) {
      setErrorMsg('请先同意相关协议')
      return
    }
    setAuthSubmitting(true)
    setAuthMessage('')
    setAuthMessageType('')
    try {
      const result = await apiRequest<ApiResult<null>>('/web/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: authForms.registerEmail,
          code: authForms.registerCode,
          password: authForms.registerPassword,
          confirm_password: authForms.registerConfirmPassword,
          agreed: authForms.registerAgreed,
        }),
      })
      const nextToken = String(result.token || '')
      setStoredToken(nextToken)
      setToken(nextToken)
      setUser((result as any).user || null)
      setSuccessMsg('注册成功，正在跳转...')
      setTimeout(() => navigateTo({ view: 'app', tab: 'trading' }), 800)
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogin = async () => {
    // Front-end validation before sending to API
    if (!authForms.loginEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForms.loginEmail)) {
      setErrorMsg('请输入有效的邮箱地址')
      return
    }
    if (!authForms.loginPassword) {
      setErrorMsg('请输入密码')
      return
    }
    setAuthSubmitting(true)
    setAuthMessage('')
    setAuthMessageType('')
    try {
      const result = await apiRequest<ApiResult<null>>('/web/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: authForms.loginEmail,
          password: authForms.loginPassword,
        }),
      })
      const nextToken = String(result.token || '')
      setStoredToken(nextToken)
      setToken(nextToken)
      setUser((result as any).user || null)
      setSuccessMsg('登录成功，正在跳转...')
      setTimeout(() => navigateTo({ view: 'app', tab: 'trading' }), 800)
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogout = () => {
    clearStoredToken()
    setToken('')
    setUser(null)
    navigateTo({ view: 'auth', mode: 'login' })
  }

  const handleSaveWithdrawPassword = async () => {
    if (withdrawPasswordForm.password !== withdrawPasswordForm.confirmPassword) {
      setGlobalError('两次输入的提现密码不一致')
      return
    }
    try {
      setPasswordLoading(true)
      const result = await apiRequest<ApiResult<null>>('/web/wallet/withdraw-password', {
        method: 'POST',
        body: JSON.stringify({ password: withdrawPasswordForm.password }),
      }, token)
      setGlobalError(result.message || '提现密码设置成功')
      setHasWithdrawPassword(true)
      setWithdrawPasswordForm({ password: '', confirmPassword: '' })
    } catch (error: any) {
      setGlobalError(error.message)
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleWithdrawSubmit = async () => {
    try {
      setWithdrawSubmitting(true)
      const result = await apiRequest<ApiResult<null>>('/web/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify(withdrawForm),
      }, token)
      setGlobalError(result.message || '提现申请已提交')
      setWithdrawForm((current) => ({ ...current, amount: '', to_address: '', withdraw_password: '' }))
    } catch (error: any) {
      setGlobalError(error.message)
    } finally {
      setWithdrawSubmitting(false)
    }
  }

  const guarded = (nextRoute: Route) => {
    if (!token) {
      navigateTo({ view: 'auth', mode: 'login' })
      return
    }
    navigateTo(nextRoute)
  }

  const renderTrading = () => (
    <section className="view-stack">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">默认落点</span>
          <h2>即时交易入口</h2>
          <p>登录后默认进入与 Mini App 相同的信息架构，网页端当前先开放行情浏览、钱包充值/提现与用户中心能力。</p>
        </div>
        <button className="primary-button" onClick={() => guarded({ view: 'deposit' })}>前往充值</button>
      </div>
      {pairsLoading ? <div className="empty-card">正在加载交易对...</div> : (
        <div className="grid-cards">
          {pairs.slice(0, 6).map((pair) => (
            <article className="info-card" key={pair.id}>
              <div className="card-top">
                <strong>{pair.display_name}</strong>
                <span>{pair.symbol}</span>
              </div>
              <div className="price-text">{Number(pair.current_price || 0).toFixed(4)}</div>
              <div className={Number(pair.price_change_24h || 0) >= 0 ? 'pill positive' : 'pill negative'}>
                24H {Number(pair.price_change_24h || 0).toFixed(2)}%
              </div>
            </article>
          ))}
          {!pairs.length && <div className="empty-card">当前没有可展示的交易对。</div>}
        </div>
      )}
    </section>
  )

  const renderAuction = () => (
    <section className="view-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Mini App 同构</span>
          <h2>夺宝</h2>
        </div>
        <span className="muted-text">网页端不展示转账入口。</span>
      </div>
      {auctionsLoading ? <div className="empty-card">正在加载夺宝项目...</div> : (
        <div className="grid-cards">
          {auctions.slice(0, 6).map((item) => (
            <article className="info-card" key={item.id}>
              <strong>{item.title}</strong>
              <span>参与成本：{formatMoney(item.per_person_cost)}</span>
              <span>奖品价值：{formatMoney(item.product_value)}</span>
              <span>当前参与人数：{item.current_participants || 0}</span>
            </article>
          ))}
          {!auctions.length && <div className="empty-card">暂无进行中的夺宝项目。</div>}
        </div>
      )}
    </section>
  )

  const renderProducts = () => (
    <section className="view-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Mini App 同构</span>
          <h2>定期产品</h2>
        </div>
      </div>
      {productsLoading ? <div className="empty-card">正在加载产品...</div> : (
        <div className="grid-cards">
          {products.slice(0, 6).map((item) => (
            <article className="info-card" key={item.id}>
              <strong>{item.name}</strong>
              <span>起投：{formatMoney(item.price)}</span>
              <span>年化：{Number(item.annual_yield || 0).toFixed(1)}%</span>
              <span>期限：{item.duration_days || 0} 天</span>
            </article>
          ))}
          {!products.length && <div className="empty-card">当前没有可展示的定期产品。</div>}
        </div>
      )}
    </section>
  )

  const renderCharity = () => (
    <section className="view-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Mini App 同构</span>
          <h2>公益活动</h2>
        </div>
      </div>
      {charityLoading ? <div className="empty-card">正在加载公益项目...</div> : (
        <div className="grid-cards">
          {charity.slice(0, 6).map((item) => (
            <article className="info-card" key={item.id}>
              <strong>{item.title}</strong>
              <span>目标金额：{formatMoney(item.goal_amount)}</span>
              <span>已筹金额：{formatMoney(item.raised_amount)}</span>
              <span>进度：{Number(item.progress_override || 0)}%</span>
            </article>
          ))}
          {!charity.length && <div className="empty-card">暂无公益项目。</div>}
        </div>
      )}
    </section>
  )

  const renderProfile = () => (
    <section className="view-stack">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">用户中心</span>
          <h2>{user?.email}</h2>
          <p>UID：{user?.unique_id} · 邮箱已验证：{user?.email_verified ? '是' : '否'}</p>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={() => guarded({ view: 'deposit' })}>独立充值页</button>
          <button className="secondary-button" onClick={() => guarded({ view: 'withdraw' })}>独立提现页</button>
        </div>
      </div>

      <div className="grid-cards compact">
        {summaryCards.map((item) => (
          <article className="info-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="content-grid">
        <article className="panel-card">
          <h3>设置提现密码</h3>
          <p className="muted-text">提现密码不在注册流程中设置，而是在用户中心单独维护。</p>
          <div className="field-grid">
            <label>
              <span>提现密码（至少 6 位数字）</span>
              <input
                type="password"
                value={withdrawPasswordForm.password}
                onChange={(event) => setWithdrawPasswordForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <label>
              <span>确认提现密码</span>
              <input
                type="password"
                value={withdrawPasswordForm.confirmPassword}
                onChange={(event) => setWithdrawPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
            </label>
          </div>
          <button className="primary-button" disabled={passwordLoading} onClick={handleSaveWithdrawPassword}>
            {hasWithdrawPassword ? '更新提现密码' : '设置提现密码'}
          </button>
        </article>

        <article className="panel-card">
          <h3>最近钱包记录</h3>
          {transactionsLoading ? <div className="empty-card inset">正在加载记录...</div> : (
            <div className="list-stack">
              {transactions.map((item) => (
                <div className="list-item" key={item.id}>
                  <div>
                    <strong>{item.type === 'deposit' ? '充值' : '提现'}</strong>
                    <span>{item.network_display || item.order_id || '--'}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.amount)}</strong>
                    <span>{formatDate(item.created_at)}</span>
                  </div>
                </div>
              ))}
              {!transactions.length && <div className="empty-card inset">暂无充值/提现记录。</div>}
            </div>
          )}
        </article>
      </div>

      <article className="panel-card">
        <h3>网页端说明</h3>
        <p className="muted-text">
          当前网页端开放邮箱登录/注册、钱包充值、钱包提现与用户中心能力；按照需求，不额外暴露 transfer 相关入口或页面。
        </p>
        {user?.wallet_tip_message && <div className="tip-box">{user.wallet_tip_message}</div>}
      </article>
    </section>
  )

  const renderAppView = () => {
    switch (activeTab) {
      case 'auction':
        return renderAuction()
      case 'products':
        return renderProducts()
      case 'charity':
        return renderCharity()
      case 'profile':
        return renderProfile()
      default:
        return renderTrading()
    }
  }

  const currentDepositNetwork = depositNetworks.find((item) => String(item.id) === selectedDepositNetwork)
  const currentWithdrawNetwork = withdrawNetworks.find((item) => String(item.id) === withdrawForm.network_id)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-badge">{brandName} Web</span>
          <h1>{cardTitle(route)}</h1>
        </div>
        {token && user && (
          <div className="topbar-actions">
            <span className="user-chip">{user.email}</span>
            <button className="secondary-button small" onClick={handleLogout}>退出登录</button>
          </div>
        )}
      </header>

      {globalError && <div className="status-banner">{globalError}</div>}

      {loadingUser ? (
        <main className="main-card"><div className="empty-card inset">正在同步账户信息...</div></main>
      ) : route.view === 'auth' ? (
        <main className="main-card auth-card">
          <div className="auth-switch">
            <button
              className={route.mode === 'login' ? 'tab-button active' : 'tab-button'}
              onClick={() => { navigateTo({ view: 'auth', mode: 'login' }); setAuthMessage(''); setAuthMessageType('') }}
            >
              登录
            </button>
            <button
              className={route.mode === 'register' ? 'tab-button active' : 'tab-button'}
              onClick={() => { navigateTo({ view: 'auth', mode: 'register' }); setAuthMessage(''); setAuthMessageType('') }}
            >
              注册
            </button>
          </div>

          {route.mode === 'login' ? (
            <div className="form-stack">
              <label>
                <span>邮箱</span>
                <input
                  value={authForms.loginEmail}
                  onChange={(event) => handleAuthChange('loginEmail', event.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  type="email"
                  autoComplete="email"
                />
              </label>
              <label>
                <span>密码</span>
                <div className="pwd-wrap">
                  <input
                    value={authForms.loginPassword}
                    onChange={(event) => handleAuthChange('loginPassword', event.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    type={showLoginPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowLoginPwd((v) => !v)}>
                    {showLoginPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </label>
              <p className="muted-text" style={{ fontSize: '12px', textAlign: 'right', margin: '0' }}>
                如需找回密码，请联系客服
              </p>
              <button className="primary-button" disabled={authSubmitting} onClick={handleLogin}>
                {authSubmitting ? <><span className="spinner" />登录中...</> : '登录并进入即时交易'}
              </button>
            </div>
          ) : (
            <div className="form-stack">
              <label>
                <span>邮箱</span>
                <input
                  value={authForms.registerEmail}
                  onChange={(event) => handleAuthChange('registerEmail', event.target.value)}
                  type="email"
                  autoComplete="email"
                />
              </label>
              <div className="inline-field">
                <label>
                  <span>邮箱验证码</span>
                  <input
                    value={authForms.registerCode}
                    onChange={(event) => handleAuthChange('registerCode', event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </label>
                <button className="secondary-button code-button" disabled={sendCodeLoading || sendCodeCountdown > 0} onClick={handleSendCode}>
                  {sendCodeCountdown > 0 ? `${sendCodeCountdown}s` : sendCodeLoading ? '发送中...' : '发送验证码'}
                </button>
              </div>
              <label>
                <span>密码</span>
                <div className="pwd-wrap">
                  <input
                    value={authForms.registerPassword}
                    onChange={(event) => handleAuthChange('registerPassword', event.target.value)}
                    type={showRegPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowRegPwd((v) => !v)}>
                    {showRegPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </label>
              {authForms.registerPassword.length > 0 && (
                <p style={{ fontSize: '12px', margin: '0', color: authForms.registerPassword.length >= 8 ? '#4caf50' : '#f0a500' }}>
                  {authForms.registerPassword.length >= 8 ? '✓ 密码强度符合要求' : `密码还需 ${8 - authForms.registerPassword.length} 位`}
                </p>
              )}
              <label>
                <span>确认密码</span>
                <div className="pwd-wrap">
                  <input
                    value={authForms.registerConfirmPassword}
                    onChange={(event) => handleAuthChange('registerConfirmPassword', event.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    type={showRegConfirmPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                  />
                  <button type="button" className="pwd-toggle" onClick={() => setShowRegConfirmPwd((v) => !v)}>
                    {showRegConfirmPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={authForms.registerAgreed}
                  onChange={(event) => handleAuthChange('registerAgreed', event.target.checked)}
                />
                <span>我已阅读并同意相关协议</span>
              </label>
              <button className="primary-button" disabled={authSubmitting} onClick={handleRegister}>
                {authSubmitting ? <><span className="spinner" />注册中...</> : '注册并进入即时交易'}
              </button>
            </div>
          )}

          {authMessage && (
            <div className={`hint-box ${authMessageType}`}>
              {authMessage}
            </div>
          )}
        </main>
      ) : route.view === 'deposit' ? (
        <main className="main-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">独立页面</span>
              <h2>充值</h2>
            </div>
            <button className="secondary-button small" onClick={() => guarded({ view: 'app', tab: 'profile' })}>返回用户中心</button>
          </div>

          <div className="field-grid">
            <label>
              <span>选择网络</span>
              <select value={selectedDepositNetwork} onChange={(event) => setSelectedDepositNetwork(event.target.value)}>
                {depositNetworks.map((network) => (
                  <option key={network.id} value={network.id}>{network.network_display} / {network.chain_name}</option>
                ))}
              </select>
            </label>
          </div>

          {depositNetworksLoading || depositLoading ? <div className="empty-card inset">正在加载充值地址...</div> : (
            <div className="content-grid">
              <article className="panel-card">
                <h3>充值地址</h3>
                <div className="address-box">{depositAddress || '暂无地址'}</div>
                <div className="muted-text">网络：{currentDepositNetwork?.network_display || '--'} · 最低充值：{formatMoney(currentDepositNetwork?.min_deposit_amount)}</div>
              </article>

              <article className="panel-card center">
                <h3>二维码</h3>
                {depositQr ? <img className="qr-image" src={depositQr} alt="Deposit QR Code" /> : <div className="empty-card inset">暂无二维码</div>}
              </article>
            </div>
          )}

          <article className="panel-card">
            <h3>充值注意事项</h3>
            <ul className="bullet-list">
              <li>请务必选择正确的网络后再转账，避免资产损失。</li>
              <li>到账记录可在“个人中心 - 最近钱包记录”中查看。</li>
              <li>网页端当前不开放转账功能，请勿向其他用户地址误转。</li>
            </ul>
          </article>
        </main>
      ) : route.view === 'withdraw' ? (
        <main className="main-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">独立页面</span>
              <h2>提现</h2>
            </div>
            <button className="secondary-button small" onClick={() => guarded({ view: 'app', tab: 'profile' })}>返回用户中心</button>
          </div>

          {!hasWithdrawPassword && (
            <div className="status-banner">请先在用户中心设置提现密码后再提交提现申请。</div>
          )}

          {withdrawNetworksLoading ? <div className="empty-card inset">正在加载提现网络...</div> : (
            <div className="field-grid">
              <label>
                <span>选择网络</span>
                <select value={withdrawForm.network_id} onChange={(event) => setWithdrawForm((current) => ({ ...current, network_id: event.target.value }))}>
                  {withdrawNetworks.map((network) => (
                    <option key={network.id} value={network.id}>{network.network_display} / {network.chain_name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>提现地址</span>
                <input value={withdrawForm.to_address} onChange={(event) => setWithdrawForm((current) => ({ ...current, to_address: event.target.value }))} />
              </label>
              <label>
                <span>提现金额</span>
                <input value={withdrawForm.amount} onChange={(event) => setWithdrawForm((current) => ({ ...current, amount: event.target.value }))} />
              </label>
              <label>
                <span>提现密码</span>
                <input type="password" value={withdrawForm.withdraw_password} onChange={(event) => setWithdrawForm((current) => ({ ...current, withdraw_password: event.target.value }))} />
              </label>
            </div>
          )}

          <article className="panel-card">
            <div className="list-item">
              <div>
                <strong>当前网络</strong>
                <span>{currentWithdrawNetwork?.network_display || '--'}</span>
              </div>
              <div>
                <strong>钱包余额</strong>
                <span>{formatMoney(user?.wallet_balance)}</span>
              </div>
            </div>
            <button className="primary-button" disabled={!hasWithdrawPassword || withdrawSubmitting} onClick={handleWithdrawSubmit}>
              {withdrawSubmitting ? '提交中...' : '提交提现申请'}
            </button>
          </article>
        </main>
      ) : (
        <main className="main-card">
          {renderAppView()}
        </main>
      )}

      {route.view === 'app' && (
        <nav className="bottom-nav">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={tab.key === activeTab ? 'nav-item active' : 'nav-item'}
              onClick={() => guarded({ view: 'app', tab: tab.key })}
            >
              <span>{tab.icon}</span>
              <small>{tab.label}</small>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

export default App
