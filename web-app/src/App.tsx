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

type Lang = 'zh' | 'en' | 'fr' | 'de' | 'es' | 'ar' | 'ja'

type I18nItem = {
  login: string
  register: string
  email: string
  password: string
  confirmPassword: string
  verifyCode: string
  sendCode: string
  sending: string
  forgotPassword: string
  contactSupport: string
  agreeTerms: string
  loginBtn: string
  registerBtn: string
  loggingIn: string
  registering: string
  passwordStrengthOk: string
  passwordStrengthNeeds: string
  loginSuccess: string
  registerSuccess: string
  codeSent: string
  errors: {
    invalidEmail: string
    invalidCode: string
    passwordTooShort: string
    passwordMismatch: string
    agreeRequired: string
    emailRequired: string
    passwordRequired: string
  }
}

const I18N: Record<Lang, I18nItem> = {
  zh: {
    login: '登录',
    register: '注册',
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    verifyCode: '邮箱验证码',
    sendCode: '发送验证码',
    sending: '发送中...',
    forgotPassword: '忘记密码？',
    contactSupport: '联系客服',
    agreeTerms: '我已阅读并同意相关协议',
    loginBtn: '登录',
    registerBtn: '注册',
    loggingIn: '登录中...',
    registering: '注册中...',
    passwordStrengthOk: '✓ 密码强度符合要求',
    passwordStrengthNeeds: '密码还需',
    loginSuccess: '登录成功，正在跳转...',
    registerSuccess: '注册成功，正在跳转...',
    codeSent: '验证码已发送',
    errors: {
      invalidEmail: '请输入有效的邮箱地址',
      invalidCode: '请输入 6 位数字验证码',
      passwordTooShort: '密码至少需要 8 位',
      passwordMismatch: '两次输入的密码不一致',
      agreeRequired: '请先同意相关协议',
      emailRequired: '请输入邮箱',
      passwordRequired: '请输入密码',
    },
  },
  en: {
    login: 'Login',
    register: 'Register',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    verifyCode: 'Verification Code',
    sendCode: 'Send Code',
    sending: 'Sending...',
    forgotPassword: 'Forgot password?',
    contactSupport: 'Contact Support',
    agreeTerms: 'I agree to the Terms and Conditions',
    loginBtn: 'Login',
    registerBtn: 'Register',
    loggingIn: 'Logging in...',
    registering: 'Registering...',
    passwordStrengthOk: '✓ Password strength OK',
    passwordStrengthNeeds: 'Need',
    loginSuccess: 'Login successful, redirecting...',
    registerSuccess: 'Registered successfully, redirecting...',
    codeSent: 'Verification code sent',
    errors: {
      invalidEmail: 'Please enter a valid email address',
      invalidCode: 'Please enter a 6-digit verification code',
      passwordTooShort: 'Password must be at least 8 characters',
      passwordMismatch: 'Passwords do not match',
      agreeRequired: 'Please agree to the terms',
      emailRequired: 'Please enter your email',
      passwordRequired: 'Please enter your password',
    },
  },
  fr: {
    login: 'Connexion',
    register: 'Inscription',
    email: 'E-mail',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    verifyCode: 'Code de vérification',
    sendCode: 'Envoyer le code',
    sending: 'Envoi...',
    forgotPassword: 'Mot de passe oublié ?',
    contactSupport: 'Contacter le support',
    agreeTerms: "J'accepte les conditions d'utilisation",
    loginBtn: 'Connexion',
    registerBtn: "S'inscrire",
    loggingIn: 'Connexion...',
    registering: 'Inscription...',
    passwordStrengthOk: '✓ Mot de passe conforme',
    passwordStrengthNeeds: 'Il manque encore',
    loginSuccess: 'Connexion réussie, redirection...',
    registerSuccess: 'Inscription réussie, redirection...',
    codeSent: 'Code envoyé',
    errors: {
      invalidEmail: "Veuillez saisir une adresse e-mail valide",
      invalidCode: 'Veuillez saisir un code à 6 chiffres',
      passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères',
      passwordMismatch: 'Les mots de passe ne correspondent pas',
      agreeRequired: "Veuillez accepter les conditions",
      emailRequired: "Veuillez saisir votre e-mail",
      passwordRequired: 'Veuillez saisir votre mot de passe',
    },
  },
  de: {
    login: 'Anmelden',
    register: 'Registrieren',
    email: 'E-Mail',
    password: 'Passwort',
    confirmPassword: 'Passwort bestätigen',
    verifyCode: 'Verifizierungscode',
    sendCode: 'Code senden',
    sending: 'Senden...',
    forgotPassword: 'Passwort vergessen?',
    contactSupport: 'Support kontaktieren',
    agreeTerms: 'Ich stimme den Nutzungsbedingungen zu',
    loginBtn: 'Anmelden',
    registerBtn: 'Registrieren',
    loggingIn: 'Anmeldung...',
    registering: 'Registrierung...',
    passwordStrengthOk: '✓ Passwortstärke OK',
    passwordStrengthNeeds: 'Noch',
    loginSuccess: 'Anmeldung erfolgreich, Weiterleitung...',
    registerSuccess: 'Registrierung erfolgreich, Weiterleitung...',
    codeSent: 'Code wurde gesendet',
    errors: {
      invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
      invalidCode: 'Bitte geben Sie einen 6-stelligen Code ein',
      passwordTooShort: 'Passwort muss mindestens 8 Zeichen lang sein',
      passwordMismatch: 'Passwörter stimmen nicht überein',
      agreeRequired: 'Bitte stimmen Sie den Bedingungen zu',
      emailRequired: 'Bitte geben Sie Ihre E-Mail ein',
      passwordRequired: 'Bitte geben Sie Ihr Passwort ein',
    },
  },
  es: {
    login: 'Iniciar sesión',
    register: 'Registrarse',
    email: 'Correo electrónico',
    password: 'Contraseña',
    confirmPassword: 'Confirmar contraseña',
    verifyCode: 'Código de verificación',
    sendCode: 'Enviar código',
    sending: 'Enviando...',
    forgotPassword: '¿Olvidaste tu contraseña?',
    contactSupport: 'Contactar soporte',
    agreeTerms: 'Acepto los términos y condiciones',
    loginBtn: 'Iniciar sesión',
    registerBtn: 'Registrarse',
    loggingIn: 'Iniciando sesión...',
    registering: 'Registrando...',
    passwordStrengthOk: '✓ Contraseña válida',
    passwordStrengthNeeds: 'Faltan',
    loginSuccess: 'Inicio de sesión exitoso, redirigiendo...',
    registerSuccess: 'Registro exitoso, redirigiendo...',
    codeSent: 'Código enviado',
    errors: {
      invalidEmail: 'Introduce un correo electrónico válido',
      invalidCode: 'Introduce un código de verificación de 6 dígitos',
      passwordTooShort: 'La contraseña debe tener al menos 8 caracteres',
      passwordMismatch: 'Las contraseñas no coinciden',
      agreeRequired: 'Acepta los términos primero',
      emailRequired: 'Introduce tu correo electrónico',
      passwordRequired: 'Introduce tu contraseña',
    },
  },
  ar: {
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    verifyCode: 'رمز التحقق',
    sendCode: 'إرسال الرمز',
    sending: 'جارٍ الإرسال...',
    forgotPassword: 'نسيت كلمة المرور؟',
    contactSupport: 'تواصل مع الدعم',
    agreeTerms: 'أوافق على الشروط والأحكام',
    loginBtn: 'دخول',
    registerBtn: 'تسجيل',
    loggingIn: 'جارٍ الدخول...',
    registering: 'جارٍ التسجيل...',
    passwordStrengthOk: '✓ قوة كلمة المرور مقبولة',
    passwordStrengthNeeds: 'تحتاج',
    loginSuccess: 'تم الدخول بنجاح، جارٍ التحويل...',
    registerSuccess: 'تم التسجيل بنجاح، جارٍ التحويل...',
    codeSent: 'تم إرسال رمز التحقق',
    errors: {
      invalidEmail: 'يرجى إدخال بريد إلكتروني صالح',
      invalidCode: 'يرجى إدخال رمز تحقق مكون من 6 أرقام',
      passwordTooShort: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل',
      passwordMismatch: 'كلمتا المرور غير متطابقتين',
      agreeRequired: 'يرجى الموافقة على الشروط',
      emailRequired: 'يرجى إدخال البريد الإلكتروني',
      passwordRequired: 'يرجى إدخال كلمة المرور',
    },
  },
  ja: {
    login: 'ログイン',
    register: '新規登録',
    email: 'メールアドレス',
    password: 'パスワード',
    confirmPassword: 'パスワード確認',
    verifyCode: '確認コード',
    sendCode: 'コードを送信',
    sending: '送信中...',
    forgotPassword: 'パスワードをお忘れですか？',
    contactSupport: 'サポートに連絡',
    agreeTerms: '利用規約に同意します',
    loginBtn: 'ログイン',
    registerBtn: '登録',
    loggingIn: 'ログイン中...',
    registering: '登録中...',
    passwordStrengthOk: '✓ パスワードの強度OK',
    passwordStrengthNeeds: 'あと',
    loginSuccess: 'ログイン成功、リダイレクト中...',
    registerSuccess: '登録成功、リダイレクト中...',
    codeSent: '認証コードを送信しました',
    errors: {
      invalidEmail: '有効なメールアドレスを入力してください',
      invalidCode: '6桁の確認コードを入力してください',
      passwordTooShort: 'パスワードは8文字以上必要です',
      passwordMismatch: 'パスワードが一致しません',
      agreeRequired: '利用規約に同意してください',
      emailRequired: 'メールアドレスを入力してください',
      passwordRequired: 'パスワードを入力してください',
    },
  },
}

const SUPPORTED_LANGS: Lang[] = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja']
const LANG_OPTIONS: Array<{ code: Lang; label: string; flag: string }> = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
]

function detectLang(): Lang {
  const nav = navigator.language || 'en'
  const code = nav.split('-')[0].toLowerCase() as Lang
  return SUPPORTED_LANGS.includes(code) ? code : 'en'
}

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
  if (route.view === 'auth') return ''
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
  const [lang, setLang] = useState<Lang>(() => detectLang())
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const [brandName, setBrandName] = useState('ENKPay')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [contactTelegram, setContactTelegram] = useState('')
  const [slogans, setSlogans] = useState<Partial<Record<Lang, string>>>({})
  const [withdrawPasswordForm, setWithdrawPasswordForm] = useState({ password: '', confirmPassword: '' })
  const t = I18N[lang]

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
    if (!langDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('.lang-dropdown-wrap')) {
        setLangDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [langDropdownOpen])

  useEffect(() => {
    fetch('/api/landing/config')
      .then((r) => r.json())
      .then((data) => {
        if (data?.brand?.name) setBrandName(data.brand.name)
        if (data?.brand?.logoUrl) setBrandLogoUrl(data.brand.logoUrl)
        if (typeof data?.contact?.telegram === 'string') setContactTelegram(data.contact.telegram)
        if (data?.slogans && typeof data.slogans === 'object') {
          const next: Partial<Record<Lang, string>> = {}
          SUPPORTED_LANGS.forEach((key) => {
            if (typeof data.slogans[key] === 'string') next[key] = data.slogans[key]
          })
          setSlogans(next)
        }
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
  const safeTelegram = contactTelegram.trim().replace(/^@/, '')
  const currentSlogan = slogans[lang] || slogans.en || ''

  const handleSendCode = async () => {
    if (!authForms.registerEmail) {
      setErrorMsg(t.errors.emailRequired)
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
      setSuccessMsg(result.message || t.codeSent)
      setSendCodeCountdown(60)
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setSendCodeLoading(false)
    }
  }

  const handleRegister = async () => {
    // Front-end validation before sending to API
    if (!authForms.registerEmail) {
      setErrorMsg(t.errors.emailRequired)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForms.registerEmail)) {
      setErrorMsg(t.errors.invalidEmail)
      return
    }
    if (!authForms.registerCode || !/^\d{6}$/.test(authForms.registerCode)) {
      setErrorMsg(t.errors.invalidCode)
      return
    }
    if (authForms.registerPassword.length < 8) {
      setErrorMsg(t.errors.passwordTooShort)
      return
    }
    if (authForms.registerPassword !== authForms.registerConfirmPassword) {
      setErrorMsg(t.errors.passwordMismatch)
      return
    }
    if (!authForms.registerAgreed) {
      setErrorMsg(t.errors.agreeRequired)
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
      setSuccessMsg(t.registerSuccess)
      setTimeout(() => navigateTo({ view: 'app', tab: 'trading' }), 800)
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogin = async () => {
    // Front-end validation before sending to API
    if (!authForms.loginEmail) {
      setErrorMsg(t.errors.emailRequired)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForms.loginEmail)) {
      setErrorMsg(t.errors.invalidEmail)
      return
    }
    if (!authForms.loginPassword) {
      setErrorMsg(t.errors.passwordRequired)
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
      setSuccessMsg(t.loginSuccess)
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
        <div className="topbar-brand">
          {brandLogoUrl ? (
            <img src={brandLogoUrl} alt={brandName} className="brand-logo" />
          ) : (
            <span className="brand-icon">◈</span>
          )}
          <div>
            <span className="brand-name">{brandName}</span>
            {route.view === 'auth' && currentSlogan && <p className="muted-text brand-slogan">{currentSlogan}</p>}
            {route.view !== 'auth' && <h1>{cardTitle(route)}</h1>}
          </div>
        </div>
        <div className="topbar-right">
          <div className="lang-dropdown-wrap">
            <button
              className="lang-trigger"
              onClick={() => setLangDropdownOpen((v) => !v)}
              aria-label="Select language"
              aria-expanded={langDropdownOpen}
            >
              <span className="lang-flag">{LANG_OPTIONS.find((o) => o.code === lang)?.flag}</span>
              <span className="lang-code">{lang.toUpperCase()}</span>
              <svg
                className={`lang-chevron${langDropdownOpen ? ' open' : ''}`}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="4 6 8 10 12 6" />
              </svg>
            </button>

            {langDropdownOpen && (
              <ul className="lang-menu" role="listbox" aria-label="Language">
                {LANG_OPTIONS.map((option) => (
                  <li
                    key={option.code}
                    role="option"
                    aria-selected={option.code === lang}
                    className={`lang-option${option.code === lang ? ' selected' : ''}`}
                    onClick={() => {
                      setLang(option.code)
                      setLangDropdownOpen(false)
                    }}
                  >
                    <span className="lang-option-flag">{option.flag}</span>
                    <span className="lang-option-label">{option.label}</span>
                    {option.code === lang && (
                      <svg className="lang-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 8 6.5 11.5 13 5" />
                      </svg>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {token && user && (
            <>
              <span className="user-chip">{user.email}</span>
              <button className="secondary-button small" onClick={handleLogout}>⇤</button>
            </>
          )}
        </div>
      </header>

      {globalError && <div className="status-banner">{globalError}</div>}

      {loadingUser ? (
        <main className="main-card"><div className="empty-card inset">正在同步账户信息...</div></main>
      ) : route.view === 'auth' ? (
        <main className="main-card auth-card" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="auth-switch">
            <button
              className={route.mode === 'login' ? 'tab-button active' : 'tab-button'}
              onClick={() => { navigateTo({ view: 'auth', mode: 'login' }); setAuthMessage(''); setAuthMessageType('') }}
            >
              {t.login}
            </button>
            <button
              className={route.mode === 'register' ? 'tab-button active' : 'tab-button'}
              onClick={() => { navigateTo({ view: 'auth', mode: 'register' }); setAuthMessage(''); setAuthMessageType('') }}
            >
              {t.register}
            </button>
          </div>

          {route.mode === 'login' ? (
            <div className="form-stack">
              <label>
                <span>{t.email}</span>
                <input
                  value={authForms.loginEmail}
                  onChange={(event) => handleAuthChange('loginEmail', event.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  type="email"
                  autoComplete="email"
                />
              </label>
              <label>
                <span>{t.password}</span>
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
              <div className="forgot-row">
                <span className="muted-text forgot-text">{t.forgotPassword}</span>
                {safeTelegram ? (
                  <a
                    href={`https://t.me/${safeTelegram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="support-link"
                  >
                    <svg className="tg-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.152.678-.546.844-1.107.525l-3.067-2.261-1.48 1.424c-.164.164-.301.301-.617.301l.22-3.123 5.675-5.125c.247-.22-.054-.342-.384-.122L7.72 14.072 4.7 13.12c-.657-.206-.67-.657.138-.973l10.886-4.194c.547-.2 1.025.134.838.295z" />
                    </svg>
                    {t.contactSupport}
                  </a>
                ) : (
                  <span className="muted-text forgot-text">{t.contactSupport}</span>
                )}
              </div>
              <button className="primary-button auth-btn" disabled={authSubmitting} onClick={handleLogin}>
                {authSubmitting ? <><span className="spinner" />{t.loggingIn}</> : t.loginBtn}
              </button>
            </div>
          ) : (
            <div className="form-stack">
              <label>
                <span>{t.email}</span>
                <input
                  value={authForms.registerEmail}
                  onChange={(event) => handleAuthChange('registerEmail', event.target.value)}
                  type="email"
                  autoComplete="email"
                />
              </label>
              <div className="inline-field">
                <label>
                  <span>{t.verifyCode}</span>
                  <input
                    value={authForms.registerCode}
                    onChange={(event) => handleAuthChange('registerCode', event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </label>
                <button className="secondary-button code-button" disabled={sendCodeLoading || sendCodeCountdown > 0} onClick={handleSendCode}>
                  {sendCodeCountdown > 0 ? `${sendCodeCountdown}s` : sendCodeLoading ? t.sending : t.sendCode}
                </button>
              </div>
              <label>
                <span>{t.password}</span>
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
                  {authForms.registerPassword.length >= 8 ? t.passwordStrengthOk : `${t.passwordStrengthNeeds} ${8 - authForms.registerPassword.length}`}
                </p>
              )}
              <label>
                <span>{t.confirmPassword}</span>
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
                <span>{t.agreeTerms}</span>
              </label>
              <button className="primary-button auth-btn" disabled={authSubmitting} onClick={handleRegister}>
                {authSubmitting ? <><span className="spinner" />{t.registering}</> : t.registerBtn}
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
