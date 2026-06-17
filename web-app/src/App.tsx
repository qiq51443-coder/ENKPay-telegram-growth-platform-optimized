import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { createChart } from 'lightweight-charts'
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
  username?: string
  unique_id: string
  invite_code?: string
  invite_count?: number
  invited_by?: string | null
  language_code?: string
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
  id: string
  symbol: string
  display_name: string
  icon_url?: string
  pair_type?: string
  current_price?: number
  price_change_24h?: number
}

interface AuctionItem {
  id: string
  title: string
  description?: string
  product_value?: number
  per_person_cost?: number
  participant_count?: number
  current_participants?: number
  max_purchases_per_user?: number
  expires_at?: string
  winner_payout?: number
  image_url?: string
  product_image?: string
  status?: string
  winner_unique_id?: string
}

interface ProductItem {
  id: string
  name: string
  price?: number
  annual_yield?: number
  daily_yield_rate?: number
  duration_days?: number
  term_days?: number
  image_url?: string
  description?: string
  total_holders_count?: number
  max_holders?: number
  is_purchase_limited?: boolean
  max_purchases_per_user?: number
  status?: string
}

interface CharityItem {
  id: string
  title: string
  description?: string
  goal_amount?: number
  raised_amount?: number
  progress_override?: number
  image_url?: string
  organization?: string | null
  ambassador_telegram?: string | null
  status?: string
}

interface TradingRule {
  id: string
  duration_seconds: number
  odds: number
  min_bet: number
  max_bet: number
}

interface TradingOrder {
  id: string
  pair_id?: string | number
  direction: 'up' | 'down'
  amount: number
  entry_price?: number
  close_price?: number | string
  odds: number
  status: string
  result?: 'win' | 'lose' | 'draw'
  profit?: number
  created_at: string
  settled_at?: string
  symbol?: string
  display_name?: string
  session_start?: string
  session_end?: string
  period_label?: string
  session_open_price?: number | string
  session_close_price?: number | string
  duration?: number
}

interface ProductHolding {
  id: string
  product_id: string
  product_name: string
  image_url?: string
  amount: number
  daily_yield_rate?: number
  term_days?: number
  start_date: string
  end_date: string
  status: string
  total_income?: number
}

interface AuctionHistoryItem {
  id: string
  auction_id: string
  title: string
  auction_status: string
  is_winner: boolean
  refunded: boolean
  quantity: number
  amount: number
  winner_unique_id?: string
  winner_payout?: number
  result_id?: string
  is_redeemed?: boolean
}

interface CharityDonation {
  id: string
  amount: number
  message?: string
  status: string
  created_at: string
  project_title: string
  organization?: string
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
const TRADING_QUICK_AMOUNTS = [10, 50, 100, 500, 1000]
const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'trading', label: '即时交易', description: '查看当前开放的交易币对与最新价格。' },
  { key: 'auction', label: '夺宝', description: '浏览当前进行中的夺宝项目。' },
  { key: 'products', label: '定期产品', description: '查看平台当前开放的定期/NFT 产品。' },
  { key: 'charity', label: '公益活动', description: '了解平台公益项目与进度。' },
  { key: 'profile', label: '个人中心', description: '管理网页账户、提现密码与钱包操作。' },
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

function resolveAssetUrl(url?: string | null) {
  if (!url) return ''
  if (/^(data:|https?:|\/\/)/.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

function formatCompactDate(value?: string) {
  if (!value) return '--'
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCountdown(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.max(0, seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function TradingIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#F0B90B' : '#8899AA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

function AuctionIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#F0B90B' : '#8899AA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
      <line x1="12" y1="13" x2="12" y2="16" />
      <circle cx="12" cy="13" r="1" fill={active ? '#F0B90B' : '#8899AA'} stroke="none" />
    </svg>
  )
}

function ProductsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#F0B90B' : '#8899AA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function CharityIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#F0B90B' : '#8899AA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#F0B90B' : '#8899AA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function renderTabIcon(tab: TabKey, active: boolean) {
  if (tab === 'auction') return <AuctionIcon active={active} />
  if (tab === 'products') return <ProductsIcon active={active} />
  if (tab === 'charity') return <CharityIcon active={active} />
  if (tab === 'profile') return <ProfileIcon active={active} />
  return <TradingIcon active={active} />
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
  const [mailServiceEnabled, setMailServiceEnabled] = useState(true) // Default to true for safety
  const [contactTelegram, setContactTelegram] = useState('')
  const [slogans, setSlogans] = useState<Partial<Record<Lang, string>>>({})
  const [withdrawPasswordForm, setWithdrawPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [livePrice, setLivePrice] = useState<Record<string, { price: number; change24h: number }>>({})
  const [selectedTradingPair, setSelectedTradingPair] = useState<TradingPair | null>(null)
  const [tradingRules, setTradingRules] = useState<TradingRule[]>([])
  const [selectedTradingDuration, setSelectedTradingDuration] = useState(60)
  const [tradingCountdown, setTradingCountdown] = useState(0)
  const [selectedTradingDirection, setSelectedTradingDirection] = useState<'up' | 'down'>('up')
  const [tradingConfirmOpen, setTradingConfirmOpen] = useState(false)
  const [tradingOrders, setTradingOrders] = useState<TradingOrder[]>([])
  const [tradingOrdersLoading, setTradingOrdersLoading] = useState(false)
  const [klineInterval, setKlineInterval] = useState('1m')
  const [tradingAmount, setTradingAmount] = useState('')
  const [tradingSubmitting, setTradingSubmitting] = useState(false)
  const [tradingOrderError, setTradingOrderError] = useState('')
  const [tradingOrderSuccess, setTradingOrderSuccess] = useState('')
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null)
  const [auctionQuantity, setAuctionQuantity] = useState(1)
  const [auctionSubmitting, setAuctionSubmitting] = useState(false)
  const [auctionActionMessage, setAuctionActionMessage] = useState('')
  const [auctionHistory, setAuctionHistory] = useState<AuctionHistoryItem[]>([])
  const [auctionHistoryLoading, setAuctionHistoryLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null)
  const [productSubmitting, setProductSubmitting] = useState(false)
  const [productActionMessage, setProductActionMessage] = useState('')
  const [productHoldings, setProductHoldings] = useState<ProductHolding[]>([])
  const [productHoldingsLoading, setProductHoldingsLoading] = useState(false)
  const [selectedCharity, setSelectedCharity] = useState<CharityItem | null>(null)
  const [charityDonateAmount, setCharityDonateAmount] = useState('10')
  const [charitySubmitting, setCharitySubmitting] = useState(false)
  const [charityActionMessage, setCharityActionMessage] = useState('')
  const [charityDonations, setCharityDonations] = useState<CharityDonation[]>([])
  const [charityDonationsLoading, setCharityDonationsLoading] = useState(false)
  const [inviteQr, setInviteQr] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsReconnectAttemptRef = useRef(0)
  const wsIsUnmountedRef = useRef(false)
  const pricePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPriceRef = useRef<Record<string, number>>({})
  const tradingChartRef = useRef<HTMLDivElement | null>(null)
  const tradingChartInstanceRef = useRef<any>(null)
  const tradingSeriesRef = useRef<any>(null)
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
    const backendLang = user?.language_code?.split('-')[0] as Lang | undefined
    if (backendLang && SUPPORTED_LANGS.includes(backendLang)) {
      setLang((current) => (current === backendLang ? current : backendLang))
    }
  }, [user?.language_code])

  useEffect(() => {
    if (route.view !== 'app' || route.tab !== 'profile' || !user?.invite_code) {
      setInviteQr('')
      return
    }
    const inviteLink = `${window.location.origin}/?invite=${encodeURIComponent(user.invite_code)}`
    QRCode.toDataURL(inviteLink, { margin: 1, width: 220 })
      .then(setInviteQr)
      .catch(() => setInviteQr(''))
  }, [route, user?.invite_code])

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

  // Fetch mail service status on mount
  useEffect(() => {
    fetch('/api/mail/status')
      .then((r) => r.json())
      .then((data) => {
        setMailServiceEnabled(data?.enabled === true)
      })
      .catch(() => {
        // If fetch fails, default to true (safe fallback)
        setMailServiceEnabled(true)
      })
  }, [])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'trading' && pairs.length === 0) {
      setPairsLoading(true)
      apiRequest<ApiResult<TradingPair[]>>('/trading/pairs')
        .then((result) => {
          const list = result.data || []
          setPairs(list)
          const initialPrices: Record<string, { price: number; change24h: number }> = {}
          list.forEach((p) => {
            if (p.current_price != null) {
              initialPrices[p.id] = { price: Number(p.current_price), change24h: Number(p.price_change_24h ?? 0) }
              prevPriceRef.current[p.id] = Number(p.current_price)
            }
          })
          if (Object.keys(initialPrices).length > 0) {
            setLivePrice((prev) => ({ ...initialPrices, ...prev }))
          }
        })
        .finally(() => setPairsLoading(false))
    }
  }, [route, pairs.length])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'auction' && auctions.length === 0) {
      setAuctionsLoading(true)
      apiRequest<ApiResult<AuctionItem[]>>(`/auctions?status=active&limit=12&lang=${lang}`)
        .then((result) => setAuctions(result.data || []))
        .finally(() => setAuctionsLoading(false))
    }
  }, [route, auctions.length, lang])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'products' && products.length === 0) {
      setProductsLoading(true)
      apiRequest<ApiResult<ProductItem[]>>(`/nft/products?status=active&limit=12&lang=${lang}`)
        .then((result) => setProducts(result.data || []))
        .finally(() => setProductsLoading(false))
    }
  }, [route, products.length, lang])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'charity' && charity.length === 0) {
      setCharityLoading(true)
      apiRequest<ApiResult<CharityItem[]>>(`/charity/projects?limit=12&lang=${lang}`)
        .then((result) => setCharity(result.data || []))
        .finally(() => setCharityLoading(false))
    }
  }, [route, charity.length, lang])

  // WebSocket price subscription with exponential backoff reconnect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token) return

    const RECONNECT_BASE = 2000
    const RECONNECT_MAX = 30000
    const MAX_ATTEMPTS = 10

    wsIsUnmountedRef.current = false

    function connect() {
      if (wsIsUnmountedRef.current) return
      if (wsRef.current && (wsRef.current.readyState === 0 || wsRef.current.readyState === 1)) return
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/prices`)
        wsRef.current = ws
        ws.onopen = () => { wsReconnectAttemptRef.current = 0 }
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data) as { type: string; data: Record<string, { price: number; change24h: number }> }
            if (msg.type === 'prices' && msg.data) {
              triggerPriceFlash(msg.data)
              setLivePrice((prev) => ({ ...prev, ...msg.data }))
            }
          } catch {}
        }
        ws.onclose = () => {
          if (wsIsUnmountedRef.current || wsReconnectAttemptRef.current >= MAX_ATTEMPTS) return
          wsReconnectAttemptRef.current++
          const delay = Math.min(RECONNECT_BASE * Math.pow(1.5, wsReconnectAttemptRef.current - 1), RECONNECT_MAX)
          wsReconnectTimerRef.current = setTimeout(connect, delay)
        }
        ws.onerror = () => {}
      } catch {
        if (wsIsUnmountedRef.current || wsReconnectAttemptRef.current >= MAX_ATTEMPTS) return
        wsReconnectAttemptRef.current++
        const delay = Math.min(RECONNECT_BASE * Math.pow(1.5, wsReconnectAttemptRef.current - 1), RECONNECT_MAX)
        wsReconnectTimerRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      wsIsUnmountedRef.current = true
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [token])

  // HTTP price polling fallback (2s) — active only on the trading tab
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (route.view !== 'app' || route.tab !== 'trading') return

    const fetchPrices = () => {
      apiRequest<ApiResult<TradingPair[]>>('/trading/pairs')
        .then((result) => {
          const updates: Record<string, { price: number; change24h: number }> = {}
          ;(result.data || []).forEach((p) => {
            if (p.current_price != null) {
              updates[p.id] = { price: Number(p.current_price), change24h: Number(p.price_change_24h ?? 0) }
            }
          })
          if (Object.keys(updates).length > 0) {
            triggerPriceFlash(updates)
            setLivePrice((prev) => ({ ...prev, ...updates }))
          }
        })
        .catch(() => {})
    }

    pricePollRef.current = setInterval(fetchPrices, 2000)
    return () => {
      if (pricePollRef.current) clearInterval(pricePollRef.current)
    }
  }, [route])

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

  const refreshUserProfile = async () => {
    if (!token) return
    try {
      const result = await apiRequest<ApiResult<WebUser>>('/web/auth/me', {}, token)
      setUser(result.user || null)
    } catch {}
  }

  const fetchTradingOrders = async () => {
    if (!token) return
    setTradingOrdersLoading(true)
    try {
      const result = await apiRequest<ApiResult<TradingOrder[]>>('/web/app/trading/orders?limit=30', {}, token)
      setTradingOrders(result.data || [])
    } catch (error: any) {
      setTradingOrders([])
      setTradingOrderError(error.message)
    } finally {
      setTradingOrdersLoading(false)
    }
  }

  const fetchTradingRules = async (pairId: string) => {
    try {
      const result = await apiRequest<ApiResult<TradingRule[]>>(`/trading/pairs/${pairId}/rules`)
      const rules = result.data || []
      setTradingRules(rules)
      if (rules.length > 0) {
        setSelectedTradingDuration((current) =>
          rules.some((item) => item.duration_seconds === current) ? current : Number(rules[0].duration_seconds)
        )
      }
    } catch {
      setTradingRules([])
      setSelectedTradingDuration(60)
    }
  }

  const fetchAuctionHistory = async () => {
    if (!token) return
    setAuctionHistoryLoading(true)
    try {
      const result = await apiRequest<ApiResult<AuctionHistoryItem[]>>('/web/app/auctions/history', {}, token)
      setAuctionHistory(result.data || [])
    } catch {
      setAuctionHistory([])
    } finally {
      setAuctionHistoryLoading(false)
    }
  }

  const fetchProductHoldings = async () => {
    if (!token) return
    setProductHoldingsLoading(true)
    try {
      const result = await apiRequest<ApiResult<ProductHolding[]>>(`/web/app/products/holdings?lang=${lang}`, {}, token)
      setProductHoldings(result.data || [])
    } catch {
      setProductHoldings([])
    } finally {
      setProductHoldingsLoading(false)
    }
  }

  const fetchCharityDonations = async () => {
    if (!token) return
    setCharityDonationsLoading(true)
    try {
      const result = await apiRequest<ApiResult<CharityDonation[]> & { summary?: { total_donated?: number } }>('/web/app/charity/donations', {}, token)
      setCharityDonations(result.data || [])
    } catch {
      setCharityDonations([])
    } finally {
      setCharityDonationsLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedTradingPair) return
    fetchTradingRules(selectedTradingPair.id)
    if (token) fetchTradingOrders()
  }, [selectedTradingPair?.id, token])

  useEffect(() => {
    if (!selectedTradingPair) return
    let cancelled = false
    const loadPeriod = () => {
      apiRequest<ApiResult<{ current: { remaining_ms: number } }>>(`/trading/current-period?duration=${selectedTradingDuration}`)
        .then((result) => {
          if (!cancelled) {
            const remaining = Math.ceil(Number(result.data?.current?.remaining_ms || 0) / 1000)
            setTradingCountdown(Math.max(remaining, 0))
          }
        })
        .catch(() => {
          if (!cancelled) setTradingCountdown((current) => current || selectedTradingDuration)
        })
    }
    loadPeriod()
    const timer = window.setInterval(() => {
      setTradingCountdown((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    const reloadTimer = window.setInterval(loadPeriod, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.clearInterval(reloadTimer)
    }
  }, [selectedTradingPair?.id, selectedTradingDuration])

  useEffect(() => {
    if (!token || route.view !== 'app') return
    if (route.tab === 'auction') fetchAuctionHistory()
    if (route.tab === 'products') fetchProductHoldings()
    if (route.tab === 'charity') fetchCharityDonations()
    if (route.tab === 'trading') fetchTradingOrders()
  }, [route, token, lang])

  useEffect(() => {
    if (!selectedTradingPair || !tradingChartRef.current) return
    let disposed = false

    const chart = createChart(tradingChartRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#0A1628' },
        textColor: '#CBD5E1',
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.08)' },
        horzLines: { color: 'rgba(148,163,184,0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.16)',
      },
      timeScale: {
        borderColor: 'rgba(148,163,184,0.16)',
      },
      crosshair: {
        vertLine: { color: '#F0B90B' },
        horzLine: { color: '#F0B90B' },
      },
    })
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26A69A',
      downColor: '#EF5350',
      borderVisible: false,
      wickUpColor: '#26A69A',
      wickDownColor: '#EF5350',
    })
    tradingChartInstanceRef.current = chart
    tradingSeriesRef.current = candleSeries

    apiRequest<ApiResult<Array<{ time?: number; open_time?: number; open: number; high: number; low: number; close: number }>>>(
      `/trading/pairs/${selectedTradingPair.id}/kline?interval=${klineInterval}&limit=120`
    )
      .then((result) => {
        if (disposed) return
        const rows = (result.data || []).map((item) => ({
          time: Number(item.time ?? item.open_time),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
        })).filter((item) => item.time > 0)
        candleSeries.setData(rows as any)
        chart.timeScale().fitContent()
      })
      .catch(() => {})

    return () => {
      disposed = true
      tradingSeriesRef.current = null
      tradingChartInstanceRef.current = null
      chart.remove()
    }
  }, [selectedTradingPair?.id, klineInterval])

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
    // Only validate verification code if mail service is enabled
    if (mailServiceEnabled && (!authForms.registerCode || !/^\d{6}$/.test(authForms.registerCode))) {
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

  const triggerPriceFlash = (newPrices: Record<string, { price: number; change24h: number }>) => {
    Object.entries(newPrices).forEach(([id, info]) => {
      const prev = prevPriceRef.current[id]
      if (prev !== undefined && prev !== info.price && info.price > 0) {
        const el = document.querySelector(`[data-price-id="${id}"]`)
        if (el) {
          el.classList.remove('price-flash-up', 'price-flash-down')
          void (el as HTMLElement).offsetWidth
          el.classList.add(info.price > prev ? 'price-flash-up' : 'price-flash-down')
          setTimeout(() => el.classList.remove('price-flash-up', 'price-flash-down'), 600)
        }
      }
      if (info.price > 0) prevPriceRef.current[id] = info.price
    })
  }

  const handleTradingOrder = async () => {
    if (!selectedTradingPair || !tradingAmount || Number(tradingAmount) <= 0 || tradingSubmitting) return
    setTradingSubmitting(true)
    setTradingOrderError('')
    setTradingOrderSuccess('')
    try {
      const result = await apiRequest<ApiResult<{ expected_profit?: number }>>('/web/app/trading/quick-session', {
        method: 'POST',
        body: JSON.stringify({
          pair_id: selectedTradingPair.id,
          duration: selectedTradingDuration,
          direction: selectedTradingDirection,
          amount: Number(tradingAmount),
        }),
      }, token)
      setTradingOrderSuccess(
        result.message ||
          (selectedTradingDirection === 'up' ? '买涨订单已提交' : '买跌订单已提交')
      )
      setTradingAmount('')
      setTradingConfirmOpen(false)
      fetchTradingOrders()
      refreshUserProfile()
    } catch (error: any) {
      setTradingOrderError(error.message)
    } finally {
      setTradingSubmitting(false)
    }
  }

  const handleAuctionJoin = async () => {
    if (!selectedAuction || !token || auctionSubmitting) return
    setAuctionSubmitting(true)
    setAuctionActionMessage('')
    try {
      const result = await apiRequest<ApiResult<null>>(`/web/app/auctions/${selectedAuction.id}/join`, {
        method: 'POST',
        body: JSON.stringify({ quantity: auctionQuantity }),
      }, token)
      setAuctionActionMessage(result.message || '参与成功')
      fetchAuctionHistory()
      refreshUserProfile()
    } catch (error: any) {
      setAuctionActionMessage(error.message)
    } finally {
      setAuctionSubmitting(false)
    }
  }

  const handleProductPurchase = async () => {
    if (!selectedProduct || !token || productSubmitting) return
    setProductSubmitting(true)
    setProductActionMessage('')
    try {
      const result = await apiRequest<ApiResult<null>>(`/web/app/products/${selectedProduct.id}/purchase`, {
        method: 'POST',
      }, token)
      setProductActionMessage(result.message || '购买成功')
      fetchProductHoldings()
      refreshUserProfile()
    } catch (error: any) {
      setProductActionMessage(error.message)
    } finally {
      setProductSubmitting(false)
    }
  }

  const handleCharityDonate = async () => {
    if (!selectedCharity || !token || charitySubmitting || Number(charityDonateAmount) <= 0) return
    setCharitySubmitting(true)
    setCharityActionMessage('')
    try {
      const result = await apiRequest<ApiResult<null>>('/web/app/charity/donate', {
        method: 'POST',
        body: JSON.stringify({
          project_id: selectedCharity.id,
          amount: Number(charityDonateAmount),
        }),
      }, token)
      setCharityActionMessage(result.message || '捐赠成功')
      fetchCharityDonations()
      refreshUserProfile()
    } catch (error: any) {
      setCharityActionMessage(error.message)
    } finally {
      setCharitySubmitting(false)
    }
  }

  const renderTrading = () => {
    if (selectedTradingPair) {
      const pair = selectedTradingPair
      const priceInfo = livePrice[pair.id] || { price: Number(pair.current_price || 0), change24h: Number(pair.price_change_24h || 0) }
      const change = Number(priceInfo.change24h)
      const currentRule = tradingRules.find((item) => item.duration_seconds === selectedTradingDuration) || tradingRules[0]
      const pairOrders = tradingOrders.filter((item) => String(item.pair_id) === String(pair.id))
      const activeOrder = pairOrders.find((item) => item.status === 'active' || item.status === 'pending')
      return (
        <section className="view-stack">
          <div className="trading-detail-header">
            <button
              className="trading-back-btn"
              onClick={() => {
                setSelectedTradingPair(null)
                setTradingOrderError('')
                setTradingOrderSuccess('')
                setTradingConfirmOpen(false)
              }}
            >
              ←
            </button>
            {pair.icon_url ? (
              <img src={resolveAssetUrl(pair.icon_url)} alt={pair.symbol} className="pair-icon" />
            ) : (
              <div className="pair-icon-fallback">{pair.symbol[0]}</div>
            )}
            <div className="pair-title-group">
              <h2>{pair.display_name}</h2>
              <span className="pair-symbol">{pair.symbol}</span>
            </div>
          </div>

          <div className="trading-price-card">
            <div className="price-stack">
              <div className="trading-price-big" data-price-id={pair.id}>
                ${priceInfo.price > 0 ? priceInfo.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '--'}
              </div>
              <div className="muted-text">实时价格 / WebSocket</div>
            </div>
            <div className={change >= 0 ? 'pill positive' : 'pill negative'}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}% 24H
            </div>
            <div className="pill">{formatCountdown(tradingCountdown)}</div>
          </div>

          <div className="trading-detail-layout">
            <div className="view-stack">
              <article className="panel-card chart-panel">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">K 线图</span>
                    <h3>{pair.symbol}</h3>
                  </div>
                  <div className="kline-tabs">
                    {['1m', '5m', '15m', '1h', '4h', '1d'].map((item) => (
                      <button
                        key={item}
                        className={klineInterval === item ? 'secondary-button small is-active' : 'secondary-button small'}
                        onClick={() => setKlineInterval(item)}
                      >
                        {item.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div ref={tradingChartRef} className="trading-chart" />
              </article>

              <article className="panel-card">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">持仓 / 历史</span>
                    <h3>最近订单</h3>
                  </div>
                  {tradingOrdersLoading && <span className="muted-text">加载中...</span>}
                </div>
                <div className="list-stack">
                  {pairOrders.slice(0, 6).map((order) => (
                    <div className="list-item" key={order.id}>
                      <div>
                        <strong>{order.direction === 'up' ? '▲ UP' : '▼ DOWN'}</strong>
                        <span>{order.period_label || formatCompactDate(order.session_start || order.created_at)}</span>
                      </div>
                      <div>
                        <strong>{formatMoney(order.amount)}</strong>
                        <span>{order.result ? `${order.result.toUpperCase()} / ${formatCompactDate(order.created_at)}` : order.status}</span>
                      </div>
                    </div>
                  ))}
                  {!pairOrders.length && <div className="empty-card inset">暂无订单记录。</div>}
                </div>
              </article>
            </div>

            <article className="trading-order-panel">
              <div>
                <div className="trading-order-label">选择周期</div>
                <div className="duration-list">
                  {(tradingRules.length ? tradingRules : [{ id: 'default', duration_seconds: 60, odds: 1.85, min_bet: 1, max_bet: 1000 }]).map((rule) => (
                    <button
                      key={rule.id}
                      className={selectedTradingDuration === rule.duration_seconds ? 'trading-quick-btn active' : 'trading-quick-btn'}
                      onClick={() => setSelectedTradingDuration(Number(rule.duration_seconds))}
                    >
                      {rule.duration_seconds / 60}m · {Number(rule.odds).toFixed(2)}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="session-meta">
                <div>
                  <span className="muted-text">距下一期</span>
                  <strong>{formatCountdown(tradingCountdown)}</strong>
                </div>
                <div>
                  <span className="muted-text">赔率</span>
                  <strong>{Number(currentRule?.odds || 1.85).toFixed(2)}x</strong>
                </div>
                <div>
                  <span className="muted-text">限额</span>
                  <strong>{Number(currentRule?.min_bet || 1)} - {Number(currentRule?.max_bet || 1000)} USDT</strong>
                </div>
              </div>

              <div>
                <div className="trading-order-label">下单金额 (USDT)</div>
                <div className="trading-quick-amounts">
                  {TRADING_QUICK_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      className={`trading-quick-btn${Number(tradingAmount) === value ? ' active' : ''}`}
                      onClick={() => setTradingAmount(String(value))}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  className="trading-amount-input"
                  value={tradingAmount}
                  onChange={(event) => {
                    setTradingAmount(event.target.value)
                    setTradingOrderError('')
                    setTradingOrderSuccess('')
                  }}
                  placeholder="自定义金额"
                  min="0"
                />
                {user && <div className="trading-balance-hint">可用余额：{Number(user.tradable_balance).toFixed(2)} USDT</div>}
                <div className="muted-text">预期收益：{formatMoney(Number(tradingAmount || 0) * Number(currentRule?.odds || 1.85) - Number(tradingAmount || 0))}</div>
              </div>

              {activeOrder && (
                <div className="active-order-card">
                  <strong>当前持仓</strong>
                  <span>{activeOrder.direction === 'up' ? '▲ UP' : '▼ DOWN'} · {formatMoney(activeOrder.amount)}</span>
                  <span>{activeOrder.period_label || formatCompactDate(activeOrder.session_end || activeOrder.created_at)}</span>
                </div>
              )}

              <div className="trading-buttons">
                <button
                  className="trading-up-btn"
                  disabled={!tradingAmount || Number(tradingAmount) <= 0 || tradingSubmitting}
                  onClick={() => { setSelectedTradingDirection('up'); setTradingConfirmOpen(true) }}
                >
                  ▲ UP
                </button>
                <button
                  className="trading-down-btn"
                  disabled={!tradingAmount || Number(tradingAmount) <= 0 || tradingSubmitting}
                  onClick={() => { setSelectedTradingDirection('down'); setTradingConfirmOpen(true) }}
                >
                  ▼ DOWN
                </button>
              </div>
              {tradingOrderError && <div className="hint-box error">{tradingOrderError}</div>}
              {tradingOrderSuccess && <div className="hint-box success">{tradingOrderSuccess}</div>}
            </article>
          </div>

          {tradingConfirmOpen && (
            <div className="overlay-modal" onClick={() => setTradingConfirmOpen(false)}>
              <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
                <h3>确认下单</h3>
                <div className="dialog-row"><span>交易对</span><strong>{pair.display_name}</strong></div>
                <div className="dialog-row"><span>方向</span><strong>{selectedTradingDirection === 'up' ? '▲ UP' : '▼ DOWN'}</strong></div>
                <div className="dialog-row"><span>金额</span><strong>{formatMoney(Number(tradingAmount || 0))}</strong></div>
                <div className="dialog-row"><span>周期</span><strong>{selectedTradingDuration / 60} 分钟</strong></div>
                <div className="button-row">
                  <button className="secondary-button" onClick={() => setTradingConfirmOpen(false)}>取消</button>
                  <button className="primary-button" disabled={tradingSubmitting} onClick={handleTradingOrder}>
                    {tradingSubmitting ? '提交中...' : '确认'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )
    }

    return (
      <section className="view-stack">
        <div className="section-head">
          <div>
            <span className="eyebrow">Mini App 同构</span>
            <h2>交易对列表</h2>
          </div>
          <span className="muted-text">点击交易对进入桌面端详情视图</span>
        </div>
        {pairsLoading ? (
          <div className="empty-card">正在加载交易对...</div>
        ) : (
          <div className="pair-list">
            {pairs.map((pair) => {
              const priceInfo = livePrice[pair.id] || { price: Number(pair.current_price || 0), change24h: Number(pair.price_change_24h || 0) }
              const change = Number(priceInfo.change24h)
              return (
                <div
                  key={pair.id}
                  className="pair-row"
                  onClick={() => {
                    setSelectedTradingPair(pair)
                    setTradingOrderError('')
                    setTradingOrderSuccess('')
                  }}
                >
                  <div className="pair-row-left">
                    {pair.icon_url ? (
                      <img src={resolveAssetUrl(pair.icon_url)} alt={pair.symbol} className="pair-icon" />
                    ) : (
                      <div className="pair-icon-fallback">{pair.symbol[0]}</div>
                    )}
                    <div>
                      <div className="pair-name">{pair.display_name}</div>
                      <div className="pair-symbol">{pair.symbol}</div>
                    </div>
                  </div>
                  <div className="pair-row-right">
                    <div className="pair-price" data-price-id={pair.id}>
                      ${priceInfo.price > 0 ? priceInfo.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '--'}
                    </div>
                    <div className={change >= 0 ? 'pill positive' : 'pill negative'} style={{ marginTop: 2 }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  </div>
                </div>
              )
            })}
            {!pairs.length && <div className="empty-card">当前没有可展示的交易对。</div>}
          </div>
        )}
      </section>
    )
  }

  const renderAuction = () => (
    <section className="view-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Mini App 同构</span>
          <h2>夺宝活动</h2>
        </div>
        <span className="muted-text">奖品、参与人数与历史记录桌面化展示</span>
      </div>
      <div className="content-grid content-grid-wide">
        <div className="grid-cards feature-grid">
          {auctionsLoading ? <div className="empty-card">正在加载夺宝项目...</div> : auctions.map((item) => {
            const progress = clampPercent(((item.current_participants || 0) / Math.max(item.participant_count || 1, 1)) * 100)
            return (
              <article className="panel-card feature-card" key={item.id} onClick={() => { setSelectedAuction(item); setAuctionActionMessage('') }}>
                <div className="feature-cover">
                  {item.image_url || item.product_image ? <img src={resolveAssetUrl(item.image_url || item.product_image)} alt={item.title} /> : <span>🎁</span>}
                </div>
                <strong>{item.title}</strong>
                <span>奖品价值：{formatMoney(item.product_value)}</span>
                <span>参与单价：{formatMoney(item.per_person_cost)}</span>
                <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
                <span>{item.current_participants || 0} / {item.participant_count || '--'} 人 · 截止 {formatCompactDate(item.expires_at)}</span>
              </article>
            )
          })}
          {!auctionsLoading && !auctions.length && <div className="empty-card">暂无进行中的夺宝项目。</div>}
        </div>
        <article className="panel-card side-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">我的夺宝</span>
              <h3>参与记录</h3>
            </div>
          </div>
          {auctionHistoryLoading ? <div className="empty-card inset">正在加载...</div> : (
            <div className="list-stack">
              {auctionHistory.slice(0, 6).map((item) => (
                <div className="list-item" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.auction_status} · {item.quantity} 份</span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.amount)}</strong>
                    <span>{item.is_winner ? '🏆 已中奖' : '等待开奖'}</span>
                  </div>
                </div>
              ))}
              {!auctionHistory.length && <div className="empty-card inset">暂无参与记录。</div>}
            </div>
          )}
        </article>
      </div>

      {selectedAuction && (
        <div className="overlay-modal" onClick={() => setSelectedAuction(null)}>
          <div className="dialog-card large" onClick={(event) => event.stopPropagation()}>
            <div className="feature-cover large">
              {selectedAuction.image_url || selectedAuction.product_image ? (
                <img src={resolveAssetUrl(selectedAuction.image_url || selectedAuction.product_image)} alt={selectedAuction.title} />
              ) : <span>🎁</span>}
            </div>
            <h3>{selectedAuction.title}</h3>
            <p className="muted-text">{selectedAuction.description || '查看奖品详情并输入购买份数，和 Mini App 保持一致。'}</p>
            <div className="dialog-row"><span>奖品价值</span><strong>{formatMoney(selectedAuction.product_value)}</strong></div>
            <div className="dialog-row"><span>每份价格</span><strong>{formatMoney(selectedAuction.per_person_cost)}</strong></div>
            <div className="dialog-row"><span>购买份数</span><strong>{auctionQuantity}</strong></div>
            <div className="quantity-stepper">
              <button className="secondary-button small" onClick={() => setAuctionQuantity((current) => Math.max(1, current - 1))}>-</button>
              <button className="secondary-button small" onClick={() => setAuctionQuantity((current) => Math.min((selectedAuction.max_purchases_per_user || 10), current + 1))}>+</button>
            </div>
            {auctionActionMessage && <div className={auctionActionMessage.includes('成功') ? 'hint-box success' : 'hint-box error'}>{auctionActionMessage}</div>}
            <div className="button-row">
              <button className="secondary-button" onClick={() => setSelectedAuction(null)}>关闭</button>
              <button className="primary-button" disabled={auctionSubmitting || !token} onClick={handleAuctionJoin}>
                {auctionSubmitting ? '参与中...' : '立即参与'}
              </button>
            </div>
          </div>
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
      <div className="content-grid content-grid-wide">
        <div className="grid-cards feature-grid">
          {productsLoading ? <div className="empty-card">正在加载产品...</div> : products.map((item) => (
            <article className="panel-card feature-card" key={item.id} onClick={() => { setSelectedProduct(item); setProductActionMessage('') }}>
              <div className="feature-cover">
                {item.image_url ? <img src={resolveAssetUrl(item.image_url)} alt={item.name} /> : <span>💰</span>}
              </div>
              <strong>{item.name}</strong>
              <span>年化收益：{Number(item.annual_yield || Number(item.daily_yield_rate || 0) * 365 * 100).toFixed(2)}%</span>
              <span>最低投入：{formatMoney(item.price)}</span>
              <span>期限：{item.duration_days || item.term_days || 0} 天</span>
            </article>
          ))}
          {!productsLoading && !products.length && <div className="empty-card">当前没有可展示的定期产品。</div>}
        </div>
        <article className="panel-card side-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">我的持仓</span>
              <h3>收益状态</h3>
            </div>
          </div>
          {productHoldingsLoading ? <div className="empty-card inset">正在加载...</div> : (
            <div className="list-stack">
              {productHoldings.slice(0, 6).map((item) => (
                <div className="list-item" key={item.id}>
                  <div>
                    <strong>{item.product_name}</strong>
                    <span>{formatCompactDate(item.start_date)} - {formatCompactDate(item.end_date)}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.amount)}</strong>
                    <span>累计收益 {formatMoney(item.total_income)}</span>
                  </div>
                </div>
              ))}
              {!productHoldings.length && <div className="empty-card inset">暂无持仓。</div>}
            </div>
          )}
        </article>
      </div>

      {selectedProduct && (
        <div className="overlay-modal" onClick={() => setSelectedProduct(null)}>
          <div className="dialog-card large" onClick={(event) => event.stopPropagation()}>
            <h3>{selectedProduct.name}</h3>
            <div className="dialog-row"><span>最低投入</span><strong>{formatMoney(selectedProduct.price)}</strong></div>
            <div className="dialog-row"><span>期限</span><strong>{selectedProduct.duration_days || selectedProduct.term_days || 0} 天</strong></div>
            <div className="dialog-row"><span>预期年化</span><strong>{Number(selectedProduct.annual_yield || Number(selectedProduct.daily_yield_rate || 0) * 365 * 100).toFixed(2)}%</strong></div>
            <p className="muted-text">{selectedProduct.description || '确认购买后，持仓会展示在“我的持仓”区域。'}</p>
            {productActionMessage && <div className={productActionMessage.includes('成功') ? 'hint-box success' : 'hint-box error'}>{productActionMessage}</div>}
            <div className="button-row">
              <button className="secondary-button" onClick={() => setSelectedProduct(null)}>关闭</button>
              <button className="primary-button" disabled={productSubmitting || !token} onClick={handleProductPurchase}>
                {productSubmitting ? '购买中...' : '确认购买'}
              </button>
            </div>
          </div>
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
      <div className="content-grid content-grid-wide">
        <div className="grid-cards feature-grid">
          {charityLoading ? <div className="empty-card">正在加载公益项目...</div> : charity.map((item) => {
            const progress = item.progress_override != null
              ? clampPercent(Number(item.progress_override))
              : clampPercent((Number(item.raised_amount || 0) / Math.max(Number(item.goal_amount || 1), 1)) * 100)
            return (
              <article className="panel-card feature-card" key={item.id} onClick={() => { setSelectedCharity(item); setCharityActionMessage('') }}>
                <div className="feature-cover">
                  {item.image_url ? <img src={resolveAssetUrl(item.image_url)} alt={item.title} /> : <span>❤️</span>}
                </div>
                <strong>{item.title}</strong>
                <span>目标金额：{formatMoney(item.goal_amount)}</span>
                <span>已筹金额：{formatMoney(item.raised_amount)}</span>
                <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
                <span>{progress.toFixed(1)}% · {item.organization || '公益项目'}</span>
              </article>
            )
          })}
          {!charityLoading && !charity.length && <div className="empty-card">暂无公益项目。</div>}
        </div>
        <article className="panel-card side-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">捐赠记录</span>
              <h3>我的公益支持</h3>
            </div>
          </div>
          {charityDonationsLoading ? <div className="empty-card inset">正在加载...</div> : (
            <div className="list-stack">
              {charityDonations.slice(0, 6).map((item) => (
                <div className="list-item" key={item.id}>
                  <div>
                    <strong>{item.project_title}</strong>
                    <span>{item.organization || '公益项目'}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.amount)}</strong>
                    <span>{formatCompactDate(item.created_at)}</span>
                  </div>
                </div>
              ))}
              {!charityDonations.length && <div className="empty-card inset">暂无捐赠记录。</div>}
            </div>
          )}
        </article>
      </div>

      {selectedCharity && (
        <div className="overlay-modal" onClick={() => setSelectedCharity(null)}>
          <div className="dialog-card large" onClick={(event) => event.stopPropagation()}>
            <h3>{selectedCharity.title}</h3>
            <p className="muted-text">{selectedCharity.description || '查看项目进度并确认捐赠金额。'}</p>
            <div className="dialog-row"><span>目标金额</span><strong>{formatMoney(selectedCharity.goal_amount)}</strong></div>
            <div className="dialog-row"><span>已筹金额</span><strong>{formatMoney(selectedCharity.raised_amount)}</strong></div>
            <div className="dialog-row"><span>捐赠金额</span><strong>{formatMoney(Number(charityDonateAmount || 0))}</strong></div>
            <div className="trading-quick-amounts">
              {[10, 20, 50, 100].map((value) => (
                <button key={value} className={`trading-quick-btn${Number(charityDonateAmount) === value ? ' active' : ''}`} onClick={() => setCharityDonateAmount(String(value))}>
                  {value}
                </button>
              ))}
            </div>
            <input className="trading-amount-input" type="number" min="1" value={charityDonateAmount} onChange={(event) => setCharityDonateAmount(event.target.value)} />
            {charityActionMessage && <div className={charityActionMessage.includes('successfully') || charityActionMessage.includes('成功') ? 'hint-box success' : 'hint-box error'}>{charityActionMessage}</div>}
            <div className="button-row">
              <button className="secondary-button" onClick={() => setSelectedCharity(null)}>关闭</button>
              <button className="primary-button" disabled={charitySubmitting || !token} onClick={handleCharityDonate}>
                {charitySubmitting ? '捐赠中...' : '确认捐赠'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )

  const renderProfile = () => {
    const inviteLink = user?.invite_code ? `${window.location.origin}/?invite=${encodeURIComponent(user.invite_code)}` : ''
    return (
      <section className="view-stack">
        <div className="hero-panel profile-hero">
          <div>
            <span className="eyebrow">个人中心</span>
            <h2>{user?.email || user?.username || 'ENKPay User'}</h2>
            <p>UID：{user?.unique_id} · 邀请码：{user?.invite_code || user?.unique_id} · 邀请人数：{user?.invite_count || 0}</p>
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={() => guarded({ view: 'deposit' })}>充值</button>
            <button className="secondary-button" onClick={() => guarded({ view: 'withdraw' })}>提现</button>
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

        <div className="content-grid content-grid-wide">
          <article className="panel-card">
            <h3>邀请好友</h3>
            <div className="field-grid">
              <label>
                <span>邀请链接</span>
                <input value={inviteLink} readOnly />
              </label>
              <label>
                <span>邀请码</span>
                <input value={user?.invite_code || user?.unique_id || ''} readOnly />
              </label>
            </div>
            {inviteQr ? <img className="qr-image" src={inviteQr} alt="Invite QR" /> : <div className="empty-card inset">二维码生成中...</div>}
          </article>

          <article className="panel-card">
            <h3>钱包概览</h3>
            <div className="list-stack">
              <div className="list-item">
                <div>
                  <strong>可交易余额</strong>
                  <span>钱包余额 + 红包余额</span>
                </div>
                <div>
                  <strong>{formatMoney(user?.tradable_balance)}</strong>
                  <span>奖励余额 {formatMoney(user?.reward_balance)}</span>
                </div>
              </div>
              <div className="button-row">
                <button className="primary-button" onClick={() => guarded({ view: 'deposit' })}>前往充值</button>
                <button className="secondary-button" onClick={() => guarded({ view: 'withdraw' })}>前往提现</button>
              </div>
            </div>
          </article>

          <article className="panel-card">
            <h3>语言切换</h3>
            <div className="language-grid">
              {LANG_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  className={lang === option.code ? 'tab-button active' : 'tab-button'}
                  onClick={() => setLang(option.code)}
                >
                  {option.flag} {option.label}
                </button>
              ))}
            </div>
          </article>
        </div>

        <div className="content-grid content-grid-wide">
          <article className="panel-card">
            <h3>安全设置</h3>
            <p className="muted-text">提现密码在个人中心维护，与 Mini App 的账户安全区块保持一致。</p>
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

        {user?.wallet_tip_message && <div className="tip-box">{user.wallet_tip_message}</div>}
      </section>
    )
  }

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
              {mailServiceEnabled && (
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
              )}
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
              <span className="nav-icon">{renderTabIcon(tab.key, tab.key === activeTab)}</span>
              <small>{tab.label}</small>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

export default App
