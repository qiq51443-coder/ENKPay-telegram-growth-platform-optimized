import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { createChart } from 'lightweight-charts'
import './App.css'

type TabKey = 'markets' | 'swap' | 'invest' | 'wallet'
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
  { key: 'markets', label: '行情', description: '代币与交易对行情' },
  { key: 'swap', label: '闪兑', description: '资产快速兑换' },
  { key: 'invest', label: '算力', description: 'DePIN 节点 · 兑换 · 质押' },
  { key: 'wallet', label: '钱包', description: '余额、充值与提现' },
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
    const raw = hash.slice(4)
    const map: Record<string, TabKey> = {
      trading: 'markets',
      auction: 'markets',
      products: 'invest',
      charity: 'invest',
      profile: 'wallet',
      markets: 'markets',
      swap: 'swap',
      invest: 'invest',
      wallet: 'wallet',
    }
    const tab = map[raw] || 'markets'
    return { view: 'app', tab }
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
    const rawError: string = data?.error || data?.message || '请求失败'
    const translatedError = rawError
      .replace(/Too many wallet requests.*/, '请求过于频繁，请稍后再试')
      .replace(/Too many login attempts.*/, '登录尝试次数过多，请稍后再试')
      .replace(/Too many requests.*/, '请求过于频繁，请稍后再试')
    throw new Error(translatedError)
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

function SwapIcon({ active }: { active: boolean }) {
  const c = active ? '#F0B90B' : '#8899AA'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  )
}

function WalletIcon({ active }: { active: boolean }) {
  const c = active ? '#F0B90B' : '#8899AA'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="14" r="1.5" fill={c} stroke="none" />
    </svg>
  )
}

function TradingIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#F0B90B' : '#8899AA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
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

function renderTabIcon(tab: TabKey, active: boolean) {
  if (tab === 'swap') return <SwapIcon active={active} />
  if (tab === 'invest') return <ProductsIcon active={active} />
  if (tab === 'wallet') return <WalletIcon active={active} />
  return <TradingIcon active={active} />
}

function formatMoney(value?: number) {
  return `${Number(value || 0).toFixed(2)} USDT`
}

function formatDate(value?: string) {
  if (!value) return '--'
  return new Date(value).toLocaleString()
}

function getChainIcon(chainName: string) {
  const chain = (chainName || '').toUpperCase()
  if (chain === 'BSC' || chain === 'BEP20') {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#F0B90B"/>
        <path d="M12.116 14.404 16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26ZM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16Zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.002-.002 2.262-2.258ZM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16Zm-3.188-.002h.002L16 13.706l-1.634 1.635-.188.189-.39.39.002.002-.002.002L16 18.294l2.294-2.294.001-.002h-.003Z" fill="#fff"/>
      </svg>
    )
  }
  if (chain === 'ETH' || chain === 'ERC20' || chain === 'ETHEREUM') {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#627EEA"/>
        <path d="M16.498 6v7.653l6.496 2.903L16.498 6Z" fill="#fff" fillOpacity=".602"/>
        <path d="M16.498 6 10 16.556l6.498-2.903V6Z" fill="#fff"/>
        <path d="M16.498 21.968v4.027L23 17.616l-6.502 4.352Z" fill="#fff" fillOpacity=".602"/>
        <path d="M16.498 25.995v-4.028L10 17.616l6.498 8.379Z" fill="#fff"/>
        <path d="m16.498 20.573 6.496-3.957-6.496-2.9v6.857Z" fill="#fff" fillOpacity=".2"/>
        <path d="m10 16.616 6.498 3.957v-6.857l-6.498 2.9Z" fill="#fff" fillOpacity=".602"/>
      </svg>
    )
  }
  if (chain === 'TRON' || chain === 'TRC20') {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#E50915"/>
        <path d="m23.5 13.1-9.2-7.6-.3-.2H8l.4.5 5.3 8.7-5.1 3.8-.3.2.1.4 2 7.4.1.3h.6l12.5-12.9.4-.4-.5-.2ZM14.9 16l-4.3-7.1h6.2l4.7 3.9L14.9 16Zm-3.4 6.9-1.3-4.8 4-3 3.6 5.9-6.3 1.9Z" fill="#fff"/>
      </svg>
    )
  }
  if (chain === 'POLYGON' || chain === 'MATIC') {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#8247E5"/>
        <path d="M21.09 13.394c-.374-.216-.86-.216-1.272 0l-2.956 1.726-2.008 1.129-2.919 1.726c-.374.216-.86.216-1.272 0L8.9 16.788a1.293 1.293 0 0 1-.636-1.093v-3.126c0-.432.225-.836.636-1.093l1.71-.98c.374-.216.86-.216 1.272 0l1.71.98c.374.216.636.66.636 1.093v1.726l2.007-1.166v-1.726A1.293 1.293 0 0 0 15.6 10.31l-3.643-2.085c-.374-.216-.86-.216-1.272 0L6.99 10.31a1.293 1.293 0 0 0-.636 1.093v4.173c0 .432.225.836.636 1.093l3.681 2.12c.374.216.86.216 1.272 0l2.918-1.69 2.008-1.165 2.919-1.69c.374-.216.86-.216 1.272 0l1.71.98c.374.216.636.66.636 1.093v3.126c0 .432-.225.836-.636 1.093l-1.673.98c-.374.216-.86.216-1.272 0l-1.71-.98a1.293 1.293 0 0 1-.636-1.093v-1.726l-2.007 1.165v1.726c0 .432.224.836.636 1.093l3.68 2.12c.374.216.86.216 1.272 0l3.681-2.12c.374-.216.636-.66.636-1.093v-4.21a1.293 1.293 0 0 0-.636-1.093l-3.718-2.12Z" fill="#fff"/>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="rgba(240,185,11,0.2)" stroke="#F0B90B" strokeWidth="1.5"/>
      <text x="16" y="21" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#F0B90B">{chainName.slice(0,3).toUpperCase()}</text>
    </svg>
  )
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
  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 3000)
  }

  const [pairs, setPairs] = useState<TradingPair[]>([])
  const [pairsLoading, setPairsLoading] = useState(false)
  const [products, setProducts] = useState<ProductItem[]>([])
  const [, setProductsLoading] = useState(false)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [hasWithdrawPassword, setHasWithdrawPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [depositNetworks, setDepositNetworks] = useState<WalletNetwork[]>([])
  const [depositNetworksLoading, setDepositNetworksLoading] = useState(false)
  const [depositNetworksError, setDepositNetworksError] = useState('')
  const [selectedDepositNetwork, setSelectedDepositNetwork] = useState('')
  const [depositAddress, setDepositAddress] = useState('')
  const [depositAddressError, setDepositAddressError] = useState('')
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
  const [mailServiceEnabled, setMailServiceEnabled] = useState(true)
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
  const lastKlineTimeRef = useRef<number>(0)
  const lastCandleRef = useRef<{ open: number; high: number; low: number; close: number } | null>(null)
  const livePriceRef = useRef<Record<string, { price: number; change24h: number }>>({})
  const chartTickRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [profileOpenGroups, setProfileOpenGroups] = useState<Record<string, boolean>>({ funds: true, settings: false, info: false })
  const t = I18N[lang]

  const activeTab = route.view === 'app' ? route.tab : 'markets'

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) {
      navigateTo(token ? { view: 'app', tab: 'markets' } : { view: 'auth', mode: 'login' })
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
    if (route.view !== 'app' || route.tab !== 'wallet' || !user?.invite_code) {
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

  useEffect(() => {
    fetch('/api/mail/status')
      .then((r) => r.json())
      .then((data) => {
        setMailServiceEnabled(data?.enabled === true)
      })
      .catch(() => {
        setMailServiceEnabled(true)
      })
  }, [])

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'markets' && pairs.length === 0) {
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
    if (route.view === 'app' && route.tab === 'invest' && products.length === 0) {
      setProductsLoading(true)
      apiRequest<ApiResult<ProductItem[]>>(`/nft/products?status=active&limit=12&lang=${lang}`)
        .then((result) => setProducts(result.data || []))
        .finally(() => setProductsLoading(false))
    }
  }, [route, products.length, lang])

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
              livePriceRef.current = { ...livePriceRef.current, ...msg.data }
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

  useEffect(() => {
    if (route.view !== 'app' || route.tab !== 'markets') return

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
            livePriceRef.current = { ...livePriceRef.current, ...updates }
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
    if (!token || route.view !== 'app' || route.tab !== 'wallet') return

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
      .catch((error: Error) => showToast(error.message))
      .finally(() => {
        setTransactionsLoading(false)
        setPasswordLoading(false)
      })
  }, [route, token])

  useEffect(() => {
    if (!token || route.view !== 'deposit') return
    setDepositNetworksLoading(true)
    setDepositNetworksError('')
    apiRequest<ApiResult<WalletNetwork[]>>('/web/wallet/networks', {}, token)
      .then((result) => {
        const list = result.data || []
        setDepositNetworks(list)
        if (!selectedDepositNetwork && list[0]) {
          setSelectedDepositNetwork(String(list[0].id))
        }
      })
      .catch((error: Error) => {
        setDepositNetworksError(error.message || '加载充值网络失败')
      })
      .finally(() => setDepositNetworksLoading(false))
  }, [route, token, selectedDepositNetwork])

  useEffect(() => {
    if (!token || route.view !== 'deposit' || !selectedDepositNetwork) return
    setDepositLoading(true)
    setDepositAddressError('')
    apiRequest<ApiResult<{ address: string; qr_text: string }>>(`/web/wallet/deposit-address?network_id=${selectedDepositNetwork}`, {}, token)
      .then(async (result) => {
        const address = result.data?.address || ''
        setDepositAddress(address)
        setDepositAddressError('')
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
        setDepositAddressError(error.message || '加载充值地址失败')
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
      .catch((error: Error) => showToast(error.message))
      .finally(() => setWithdrawNetworksLoading(false))
  }, [route, token, withdrawForm.network_id])

  const summaryCards = useMemo(() => {
    if (!user) return []
    return [
      { label: '总资产估值', value: formatMoney(totalAssetUsdt || user.wallet_balance) },
      { label: 'USDT 余额', value: formatMoney(user.wallet_balance) },
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
    if (!selectedTradingPair || !tradingChartRef.current) return
    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let rafId: number | null = null
    let rafRetries = 0
    const MAX_RAF_RETRIES = 30

    lastKlineTimeRef.current = 0
    lastCandleRef.current = null

    const initChart = () => {
      if (disposed || !tradingChartRef.current) return

      const containerWidth = tradingChartRef.current.clientWidth
      const containerHeight = tradingChartRef.current.clientHeight
      if (containerWidth === 0 || containerHeight === 0) {
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect
            if (rect && rect.width > 0 && rect.height > 0) {
              resizeObserver?.disconnect()
              resizeObserver = null
              initChart()
            }
          })
          resizeObserver.observe(tradingChartRef.current)
        } else if (rafRetries < MAX_RAF_RETRIES) {
          rafRetries++
          rafId = requestAnimationFrame(initChart)
        }
        return
      }

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

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (!disposed && tradingChartRef.current) {
            const w = tradingChartRef.current.clientWidth
            if (w > 0) {
              try { chart.applyOptions({ width: w }) } catch {}
            }
          }
        })
        resizeObserver.observe(tradingChartRef.current)
      }

      const onVisibilityChange = () => {
        if (!document.hidden && tradingChartRef.current && !disposed) {
          const w = tradingChartRef.current.clientWidth
          if (w > 0) {
            try { chart.applyOptions({ width: w }) } catch {}
          }
        }
      }
      document.addEventListener('visibilitychange', onVisibilityChange)

      apiRequest<ApiResult<Array<{ time?: number; open_time?: number; timestamp?: number; open: number; high: number; low: number; close: number }>>>(
        `/trading/pairs/${selectedTradingPair.id}/kline?interval=${klineInterval}&limit=120`
      )
        .then((result) => {
          if (disposed) return
          const rows = (result.data || []).map((item) => {
            const rawTime = Number(item.time ?? item.open_time ?? item.timestamp ?? 0)
            const time = rawTime > 1e10 ? Math.floor(rawTime / 1000) : Math.floor(rawTime)
            return {
              time,
              open: Number(item.open),
              high: Number(item.high),
              low: Number(item.low),
              close: Number(item.close),
            }
          }).filter((item) =>
            item.time > 0 &&
            isFinite(item.open) && item.open > 0 &&
            isFinite(item.high) && item.high > 0 &&
            isFinite(item.low) && item.low > 0 &&
            isFinite(item.close) && item.close > 0
          )
          if (rows.length > 0) {
            candleSeries.setData(rows as any)
            chart.timeScale().fitContent()
            const lastRow = rows[rows.length - 1]
            lastKlineTimeRef.current = lastRow.time
            lastCandleRef.current = { open: lastRow.open, high: lastRow.high, low: lastRow.low, close: lastRow.close }
          }
        })
        .catch(() => {})

      const originalCleanup = () => {
        disposed = true
        document.removeEventListener('visibilitychange', onVisibilityChange)
        tradingSeriesRef.current = null
        tradingChartInstanceRef.current = null
        lastKlineTimeRef.current = 0
        lastCandleRef.current = null
        if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
        try { chart.remove() } catch {}
      }
      cleanupRef.current = originalCleanup
    }

    const cleanupRef = { current: () => {
      disposed = true
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
      tradingSeriesRef.current = null
      tradingChartInstanceRef.current = null
    }}

    initChart()

    return () => { cleanupRef.current() }
  }, [selectedTradingPair?.id, klineInterval])

  useEffect(() => {
    if (!selectedTradingPair) return
    const priceInfo = livePrice[selectedTradingPair.id]
    if (!priceInfo || !priceInfo.price) return
    const newPrice = priceInfo.price
    if (!tradingSeriesRef.current || lastKlineTimeRef.current === 0 || !lastCandleRef.current) return
    const lastCandle = lastCandleRef.current
    const updatedCandle = {
      time: lastKlineTimeRef.current,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, newPrice),
      low: Math.min(lastCandle.low, newPrice),
      close: newPrice,
    }
    lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: newPrice }
    try { tradingSeriesRef.current.update(updatedCandle) } catch {}
  }, [livePrice, selectedTradingPair])

  useEffect(() => {
    if (chartTickRef.current) clearTimeout(chartTickRef.current)
    if (!selectedTradingPair) return

    let stopped = false
    const scheduleTick = () => {
      const delay = 1500 + Math.random() * 1000
      chartTickRef.current = setTimeout(() => {
        if (stopped) return
        if (tradingSeriesRef.current && lastKlineTimeRef.current !== 0 && lastCandleRef.current) {
          const lastCandle = lastCandleRef.current
          const priceInfo = livePriceRef.current[selectedTradingPair.id]
          let newPrice: number | null = null
          if (priceInfo?.price) {
            newPrice = priceInfo.price
          } else if (selectedTradingPair.pair_type === 'custom') {
            const basePrice = lastCandle.close
            if (basePrice > 0) {
              const pct = 0.001 + Math.random() * 0.002
              const dir = Math.random() > 0.5 ? 1 : -1
              newPrice = basePrice * (1 + dir * pct)
            }
          }
          if (newPrice !== null && newPrice > 0) {
            const updatedCandle = {
              time: lastKlineTimeRef.current,
              open: lastCandle.open,
              high: Math.max(lastCandle.high, newPrice),
              low: Math.min(lastCandle.low, newPrice),
              close: newPrice,
            }
            lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: newPrice }
            try { tradingSeriesRef.current.update(updatedCandle) } catch {}
          }
        }
        scheduleTick()
      }, delay)
    }

    scheduleTick()
    return () => {
      stopped = true
      if (chartTickRef.current) clearTimeout(chartTickRef.current)
    }
  }, [selectedTradingPair])

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
    if (!authForms.registerEmail) {
      setErrorMsg(t.errors.emailRequired)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForms.registerEmail)) {
      setErrorMsg(t.errors.invalidEmail)
      return
    }
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
      setTimeout(() => navigateTo({ view: 'app', tab: 'markets' }), 800)
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleLogin = async () => {
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
      setTimeout(() => navigateTo({ view: 'app', tab: 'markets' }), 800)
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

  const renderTrading = () => {
    return (
      <section className="view-stack">
        <div className="section-head">
          <div>
            <h2>行情</h2>
            <p className="muted">实时价格</p>
          </div>
        </div>
        <div className="list-stack markets-list">
          {pairsLoading && <div className="empty-card">加载中...</div>}
          {!pairsLoading && pairs.map((pair) => {
            const priceInfo = livePrice[pair.id] || { price: Number(pair.current_price || 0), change24h: Number(pair.price_change_24h || 0) }
            const change = Number(priceInfo.change24h || 0)
            const vol = (pair as any).volume_24h ?? (pair as any).quote_volume ?? null
            const base = String((pair as any).base_currency || pair.symbol || '').split('/')[0]
            return (
              <div className="list-item" key={pair.id}>
                <div>
                  <strong>{base || pair.symbol}</strong>
                  <span>{pair.symbol}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{Number(priceInfo.price || 0).toFixed(pair.symbol?.includes('BTC') ? 2 : 4)}</strong>
                  <span className={change >= 0 ? 'price-up' : 'price-down'}>
                    {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    {vol != null ? ` · 量 ${Number(vol).toLocaleString()}` : ''}
                  </span>
                </div>
              </div>
            )
          })}
          {!pairsLoading && !pairs.length && <div className="empty-card">暂无行情</div>}
        </div>
      </section>
    )
  }


  const [depinTab, setDepinTab] = useState<'node' | 'stake'>('node')
  const [depinPlans, setDepinPlans] = useState<any[]>([])
  const [depinPositions, setDepinPositions] = useState<any[]>([])
  const [depinLoading, setDepinLoading] = useState(false)
  const [depinMsg, setDepinMsg] = useState('')
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeDays, setStakeDays] = useState(30)

  const loadDepin = async () => {
    if (!token) return
    setDepinLoading(true)
    try {
      const [plans, pos] = await Promise.all([
        apiRequest<any>('/depin/web/plans', {}, token),
        apiRequest<any>('/depin/web/positions', {}, token),
      ])
      setDepinPlans(Array.isArray(plans?.items) ? plans.items : [])
      setDepinPositions(Array.isArray(pos?.items) ? pos.items : [])
    } catch (e: any) {
      console.error(e)
    } finally {
      setDepinLoading(false)
    }
  }

  useEffect(() => {
    if (route.view === 'app' && route.tab === 'invest' && token) {
      loadDepin()
    }
  }, [route, token])

  const buyNode = async (planId: number) => {
    if (!token) return
    setDepinMsg('')
    try {
      const r = await apiRequest<any>('/depin/web/buy-node', { method: 'POST', body: JSON.stringify({ plan_id: planId }) }, token)
      if (r?.error) throw new Error(r.error)
      setDepinMsg('购买成功')
      loadDepin()
      try {
        const me = await apiRequest<any>('/web/auth/me', {}, token)
        if (me?.user) setUser(me.user)
      } catch {}
    } catch (e: any) {
      setDepinMsg(e.message || '购买失败')
    }
  }

  const doStake = async () => {
    if (!token) return
    setDepinMsg('')
    try {
      const r = await apiRequest<any>('/depin/web/stake', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(stakeAmount), lock_days: stakeDays }),
      }, token)
      if (r?.error) throw new Error(r.error)
      setDepinMsg('质押成功')
      setStakeAmount('')
      loadDepin()
      try {
        const me = await apiRequest<any>('/web/auth/me', {}, token)
        if (me?.user) setUser(me.user)
      } catch {}
    } catch (e: any) {
      setDepinMsg(e.message || '质押失败')
    }
  }

  const renderProducts = () => (
    <section className="view-stack">
      <div className="section-head">
        <div>
          <h2>算力</h2>
          <p className="muted">余额 {Number(user?.wallet_balance || 0).toFixed(2)} USDT</p>
        </div>
      </div>
      <div className="trading-quick-amounts" style={{ marginBottom: 16 }}>
        <button type="button" className={`trading-quick-btn${depinTab === 'node' ? ' active' : ''}`} onClick={() => setDepinTab('node')}>购买节点</button>
        <button type="button" className={`trading-quick-btn${depinTab === 'stake' ? ' active' : ''}`} onClick={() => setDepinTab('stake')}>资产质押</button>
      </div>
      {depinMsg && <div className={depinMsg.includes('成功') ? 'hint-box success' : 'hint-box error'}>{depinMsg}</div>}

      {depinTab === 'node' && (
        <div className="list-stack">
          {depinLoading && <div className="empty-card">加载中...</div>}
          {!depinLoading && depinPlans.map((p) => (
            <div className="list-item" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <span>{Number(p.price).toFixed(2)} USDT · 日收益 {Number(p.daily_yield_rate).toFixed(2)}% · {p.term_days}天</span>
              </div>
              <button className="primary-button" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => buyNode(Number(p.id))}>购买</button>
            </div>
          ))}
          {!depinLoading && !depinPlans.length && <div className="empty-card">暂无节点套餐</div>}
        </div>
      )}

      {depinTab === 'stake' && (
        <div className="panel-card" style={{ maxWidth: 480 }}>
          <input className="trading-amount-input" type="number" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} placeholder="质押金额 USDT" />
          <div className="trading-quick-amounts" style={{ marginTop: 8 }}>
            {[30, 60, 90, 180].map((d) => (
              <button key={d} type="button" className={`trading-quick-btn${stakeDays === d ? ' active' : ''}`} onClick={() => setStakeDays(d)}>{d}天</button>
            ))}
          </div>
          <button className="primary-button" style={{ marginTop: 12 }} onClick={doStake}>确认质押</button>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 24 }}>
        <div><h3>我的持仓</h3></div>
      </div>
      <div className="list-stack">
        {depinPositions.slice(0, 30).map((item) => (
          <div className="list-item" key={item.id}>
            <div>
              <strong>{item.mode === 'node_server' ? '节点' : item.mode === 'asset_stake' ? '质押' : item.mode}</strong>
              <span>{item.status}{item.lock_days ? ` · ${item.lock_days}天` : ''}</span>
            </div>
            <strong>{Number(item.amount || 0).toFixed(2)} USDT</strong>
          </div>
        ))}
        {!depinPositions.length && <div className="empty-card inset">暂无持仓</div>}
      </div>
    </section>
  )


  const renderProfile = () => {
    const inviteLink = user?.invite_code ? `${window.location.origin}/?invite=${encodeURIComponent(user.invite_code)}` : ''
    const toggleGroup = (key: string) => setProfileOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
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
            <div className="wallet-balance-row">
              <div className="wallet-balance-item">
                <div className="wbi-label">可交易余额</div>
                <div className="wbi-value highlight">{formatMoney(user?.tradable_balance)}</div>
              </div>
              <div className="wallet-balance-item">
                <div className="wbi-label">奖励余额</div>
                <div className="wbi-value">{formatMoney(user?.reward_balance)}</div>
              </div>
            </div>
            <div className="button-row">
              <button className="primary-button" onClick={() => guarded({ view: 'deposit' })}>前往充值</button>
              <button className="secondary-button" onClick={() => guarded({ view: 'withdraw' })}>前往提现</button>
            </div>
          </article>
        </div>

        <div className="profile-accordion">
          <button className="profile-accordion-header" onClick={() => toggleGroup('funds')}>
            <span>💰 资金操作</span>
            <span className={`profile-accordion-arrow${profileOpenGroups.funds ? ' open' : ''}`}>▼</span>
          </button>
          <div className={`profile-accordion-body${profileOpenGroups.funds ? ' open' : ''}`}>
            <div className="content-grid content-grid-wide">
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
              <article className="panel-card">
                <h3>快捷操作</h3>
                <div className="profile-action-list">
                  <button className="profile-action-item" onClick={() => guarded({ view: 'deposit' })}>
                    <span className="profile-action-icon">💳</span>
                    <span>充值</span>
                    <span className="profile-action-arrow">›</span>
                  </button>
                  <button className="profile-action-item" onClick={() => guarded({ view: 'withdraw' })}>
                    <span className="profile-action-icon">📤</span>
                    <span>提现</span>
                    <span className="profile-action-arrow">›</span>
                  </button>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className="profile-accordion">
          <button className="profile-accordion-header" onClick={() => toggleGroup('settings')}>
            <span>👤 账户设置</span>
            <span className={`profile-accordion-arrow${profileOpenGroups.settings ? ' open' : ''}`}>▼</span>
          </button>
          <div className={`profile-accordion-body${profileOpenGroups.settings ? ' open' : ''}`}>
            <article className="panel-card">
              <h3>安全设置</h3>
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
          </div>
        </div>

        <div className="profile-accordion">
          <button className="profile-accordion-header" onClick={() => toggleGroup('info')}>
            <span>📢 信息中心</span>
            <span className={`profile-accordion-arrow${profileOpenGroups.info ? ' open' : ''}`}>▼</span>
          </button>
          <div className={`profile-accordion-body${profileOpenGroups.info ? ' open' : ''}`}>
            <article className="panel-card">
              <div className="profile-action-list">
                {contactTelegram && (
                  <a className="profile-action-item" href={`https://t.me/${safeTelegram}`} target="_blank" rel="noreferrer">
                    <span className="profile-action-icon">💬</span>
                    <span>联系客服</span>
                    <span className="profile-action-arrow">›</span>
                  </a>
                )}
                <button className="profile-action-item" onClick={() => {
                  const el = document.getElementById('announcement-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}>
                  <span className="profile-action-icon">📣</span>
                  <span>查看公告</span>
                  <span className="profile-action-arrow">›</span>
                </button>
              </div>
            </article>
          </div>
        </div>

        {/* tips removed for cleaner DEX UI */}
      </section>
    )
  }

  const [swapFrom, setSwapFrom] = useState('USDT')
  const [swapTo, setSwapTo] = useState('')
  const [swapAmount, setSwapAmount] = useState('')
  const [swapLoading, setSwapLoading] = useState(false)
  const [swapMsg, setSwapMsg] = useState('')
  const [tokenBalances, setTokenBalances] = useState<Array<{ symbol: string; amount: number; price_usdt: number; value_usdt: number }>>([])
  const [totalAssetUsdt, setTotalAssetUsdt] = useState(0)

  const loadBalances = async () => {
    if (!token) return
    try {
      const r = await apiRequest<any>('/depin/web/balances', {}, token)
      if (Array.isArray(r?.assets)) {
        setTokenBalances(r.assets)
        setTotalAssetUsdt(Number(r.total_usdt || 0))
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!token) return
    if (route.view === 'app' && (route.tab === 'swap' || route.tab === 'wallet')) {
      loadBalances()
      const t = setInterval(loadBalances, 15000)
      return () => clearInterval(t)
    }
  }, [route, token])

  const pairBases = useMemo(() => {
    const set = new Set<string>()
    for (const p of pairs) {
      const base = String((p as any).base_currency || p.symbol || '').toUpperCase().split('/')[0]
      if (base && base !== 'USDT') set.add(base)
    }
    return Array.from(set)
  }, [pairs])

  useEffect(() => {
    if (!swapTo && pairBases.length) setSwapTo(pairBases[0])
  }, [pairBases, swapTo])

  const priceOf = (sym: string) => {
    if (sym === 'USDT') return 1
    const p = pairs.find((x) => {
      const b = String((x as any).base_currency || x.symbol || '').toUpperCase().split('/')[0]
      return b === sym || String(x.symbol).toUpperCase() === sym || String(x.symbol).toUpperCase() === `${sym}/USDT`
    })
    return p ? Number(p.current_price || 0) : 0
  }

  const estimatedOut = useMemo(() => {
    const amt = Number(swapAmount)
    if (!amt || !swapFrom || !swapTo) return 0
    if (swapFrom === 'USDT') {
      const px = priceOf(swapTo)
      return px > 0 ? amt / px : 0
    }
    if (swapTo === 'USDT') {
      return amt * priceOf(swapFrom)
    }
    return 0
  }, [swapAmount, swapFrom, swapTo, pairs])

  const balanceOf = (sym: string) => {
    const row = tokenBalances.find((a) => a.symbol === sym)
    if (row) return row.amount
    if (sym === 'USDT') return Number(user?.wallet_balance || 0)
    return 0
  }

  const flipSwap = () => {
    setSwapFrom(swapTo || 'USDT')
    setSwapTo(swapFrom)
    setSwapAmount('')
    setSwapMsg('')
  }

  const handleSwap = async () => {
    if (!token) return
    const amt = Number(swapAmount)
    if (!amt || amt <= 0) {
      setSwapMsg('请输入有效金额')
      return
    }
    if (!swapFrom || !swapTo) {
      setSwapMsg('请选择币种')
      return
    }
    setSwapLoading(true)
    setSwapMsg('')
    try {
      const result = await apiRequest<any>('/depin/web/swap', {
        method: 'POST',
        body: JSON.stringify({ from_symbol: swapFrom, to_symbol: swapTo, from_amount: amt }),
      }, token)
      if (result?.error) throw new Error(result.error)
      const got = result?.to_amount ?? result?.item?.to_amount
      setSwapMsg(`成功：${amt} ${swapFrom} → ${Number(got).toFixed(6)} ${swapTo}`)
      setSwapAmount('')
      await loadBalances()
      try {
        const me = await apiRequest<any>('/web/auth/me', {}, token)
        if (me?.user) setUser(me.user)
      } catch {}
    } catch (e: any) {
      setSwapMsg(e.message || '兑换失败')
    } finally {
      setSwapLoading(false)
    }
  }

  const renderSwapPlaceholder = () => (
    <div className="panel">
      <div className="section-head">
        <div>
          <h2>闪兑</h2>
          <p className="muted">与 USDT 兑换 · 汇率取自实时行情</p>
        </div>
      </div>
      <div className="panel-card" style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="muted">支付</span>
            <span className="muted">余额 {balanceOf(swapFrom).toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="trading-amount-input" style={{ flex: 1 }} type="number" min="0" value={swapAmount} onChange={(e) => setSwapAmount(e.target.value)} placeholder="0" />
            <select className="trading-amount-input" style={{ width: 120 }} value={swapFrom} onChange={(e) => setSwapFrom(e.target.value)}>
              <option value="USDT">USDT</option>
              {pairBases.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ textAlign: 'center', margin: '8px 0' }}>
          <button type="button" className="trading-quick-btn" onClick={flipSwap}>↕</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="muted">获得</span>
            <span className="muted">余额 {balanceOf(swapTo || 'USDT').toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="trading-amount-input" style={{ flex: 1 }} type="number" readOnly value={estimatedOut ? estimatedOut.toFixed(6) : ''} placeholder="0" />
            <select className="trading-amount-input" style={{ width: 120 }} value={swapTo} onChange={(e) => setSwapTo(e.target.value)}>
              <option value="USDT">USDT</option>
              {pairBases.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {swapFrom !== 'USDT' && swapTo !== 'USDT' && (
          <div className="hint-box error">请保证一侧为 USDT</div>
        )}
        {swapMsg && <div className={swapMsg.includes('成功') ? 'hint-box success' : 'hint-box error'}>{swapMsg}</div>}
        <button className="primary-button" style={{ marginTop: 12 }} disabled={swapLoading || !token} onClick={handleSwap}>
          {swapLoading ? '兑换中...' : '确认闪兑'}
        </button>
      </div>
    </div>
  )


  const renderAppView = () => {
    switch (activeTab) {
      case 'swap':
        return renderSwapPlaceholder()
      case 'invest':
        return renderProducts()
      case 'wallet':
        return renderProfile()
      case 'markets':
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
      {toastMessage && <div className="toast-message">{toastMessage}</div>}

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
              <h2>充值</h2>
            </div>
            <button className="secondary-button small" onClick={() => guarded({ view: 'app', tab: 'wallet' })}>返回用户中心</button>
          </div>

          {depositNetworksLoading ? (
            <div className="empty-card inset">正在加载充值网络...</div>
          ) : depositNetworksError ? (
            <div className="deposit-error-state">
              <div className="hint-box error">{depositNetworksError}</div>
              <button className="primary-button" onClick={() => {
                setDepositNetworksError('')
                setDepositNetworks([])
                setSelectedDepositNetwork('')
              }}>
                点击重试
              </button>
            </div>
          ) : (
            <div className="field-grid">
              <label>
                <span>选择网络</span>
              </label>
              <div className="network-card-grid">
                {depositNetworks.map((network) => (
                  <div
                    key={network.id}
                    className={`network-card${String(network.id) === selectedDepositNetwork ? ' selected' : ''}`}
                    onClick={() => setSelectedDepositNetwork(String(network.id))}
                  >
                    <div className="network-card-icon">{getChainIcon(network.chain_name)}</div>
                    <div className="network-card-info">
                      <div className="network-card-name">{network.network_display}</div>
                      <div className="network-card-chain">{network.chain_name}</div>
                      {network.min_deposit_amount != null && (
                        <div className="network-card-min">最低 {formatMoney(network.min_deposit_amount)}</div>
                      )}
                    </div>
                    {String(network.id) === selectedDepositNetwork && <span className="network-card-check">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!depositNetworksLoading && !depositNetworksError && (
            depositLoading ? (
              <div className="empty-card inset">正在加载充值地址...</div>
            ) : depositAddressError ? (
              <div className="deposit-error-state">
                <div className="hint-box error">{depositAddressError}</div>
                <button className="secondary-button" onClick={() => {
                  setDepositAddressError('')
                  setDepositAddress('')
                  setDepositQr('')
                }}>
                  重新获取地址
                </button>
              </div>
            ) : (
              <div className="content-grid">
                <article className="panel-card">
                  <h3>充值地址</h3>
                  <div
                    className="address-box"
                    title="点击复制"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (depositAddress) {
                        navigator.clipboard?.writeText(depositAddress).catch(() => {})
                        showToast('地址已复制')
                      }
                    }}
                  >
                    {depositAddress || '暂无地址'}
                  </div>
                  <div className="muted-text">网络：{currentDepositNetwork?.network_display || '--'} · 最低充值：{formatMoney(currentDepositNetwork?.min_deposit_amount)}</div>
                </article>

                <article className="panel-card center">
                  <h3>二维码</h3>
                  {depositQr ? <img className="qr-image" src={depositQr} alt="Deposit QR Code" /> : <div className="empty-card inset">暂无二维码</div>}
                </article>
              </div>
            )
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
              <h2>提现</h2>
            </div>
            <button className="secondary-button small" onClick={() => guarded({ view: 'app', tab: 'wallet' })}>返回用户中心</button>
          </div>

          {!hasWithdrawPassword && (
            <div className="status-banner">请先在用户中心设置提现密码后再提交提现申请。</div>
          )}

          {withdrawNetworksLoading ? <div className="empty-card inset">正在加载提现网络...</div> : (
            <div className="field-grid">
              <label>
                <span>选择网络</span>
              </label>
              <div className="network-card-grid">
                {withdrawNetworks.map((network) => (
                  <div
                    key={network.id}
                    className={`network-card${String(network.id) === withdrawForm.network_id ? ' selected' : ''}`}
                    onClick={() => setWithdrawForm((current) => ({ ...current, network_id: String(network.id) }))}
                  >
                    <div className="network-card-icon">{getChainIcon(network.chain_name)}</div>
                    <div className="network-card-info">
                      <div className="network-card-name">{network.network_display}</div>
                      <div className="network-card-chain">{network.chain_name}</div>
                    </div>
                    {String(network.id) === withdrawForm.network_id && <span className="network-card-check">✓</span>}
                  </div>
                ))}
              </div>
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
            </div>
          </article>
        </main>
      ) : (
        <main className="main-card">
          {renderAppView()}
        </main>
      )}

      {route.view === 'app' && (
        <nav className="bottom-nav" aria-label="主导航">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeTab ? 'nav-item active' : 'nav-item'}
              onClick={() => guarded({ view: 'app', tab: tab.key })}
            >
              <span className="nav-icon">{renderTabIcon(tab.key, tab.key === activeTab)}</span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

export default App
