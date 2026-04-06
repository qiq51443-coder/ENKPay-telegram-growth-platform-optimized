// User types
export interface User {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  robot_user_id?: string;
  invite_code: string;
  balance: number;
  red_packet_balance?: number;
  account_status: 'active' | 'suspended' | 'banned';
  binding_status: 'unbound' | 'pending' | 'bound';
  created_at: string;
  last_active_at?: string;
}

// Admin types
export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  role: 'super_admin' | 'admin' | 'moderator';
  created_at: string;
}

// Bot types
export interface Bot {
  id: string;
  name: string;
  token: string;
  username?: string;
  language: string;
  is_active: boolean;
  webhook_url?: string;
  created_at: string;
}

// Binding types
export interface Binding {
  id: string;
  user_id: string;
  user?: User;
  platform_username: string;
  screenshot_file_id: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// Red Packet types
export interface RedPacket {
  id: string;
  bot_id: string;
  chat_id: number;
  message_id?: number;
  title: string;
  total_amount: number;
  total_count: number;
  claimed_count: number;
  claimed_amount: number;
  status: 'active' | 'expired' | 'completed';
  expires_at: string;
  created_at: string;
}

export interface RedPacketClaim {
  id: string;
  red_packet_id: string;
  user_id: string;
  user?: User;
  amount: number;
  claimed_at: string;
}

// Screenshot types
export interface Screenshot {
  id: string;
  user_id: string;
  user?: User;
  bot_id: string;
  group_id: number;
  message_id: number;
  file_id: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// Broadcast types
export interface Broadcast {
  id: string;
  bot_id: string;
  title: string;
  content: string;
  target_type: 'all' | 'active' | 'bound' | 'unbound';
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
  scheduled_at?: string;
  sent_count?: number;
  failed_count?: number;
  created_at: string;
  sent_at?: string;
}

// Exchange types
export interface Exchange {
  id: string;
  name: string;
  name_zh?: string;
  logo_url?: string;
  register_url: string;
  tutorial_content?: {
    en?: string;
    zh?: string;
    [key: string]: string | undefined;
  };
  order_index: number;
  is_active: boolean;
  created_at: string;
}

// Tutorial types
export interface Tutorial {
  id: string;
  exchange_id: string;
  title: string;
  title_zh?: string;
  content: {
    en?: string;
    zh?: string;
    [key: string]: string | undefined;
  };
  steps?: TutorialStep[];
  order_index: number;
  is_active: boolean;
  created_at: string;
}

export interface TutorialStep {
  id: string;
  order: number;
  title: string;
  content: string;
  image_url?: string;
}

// Withdrawal types
export interface Withdrawal {
  id: string;
  user_id: string;
  user?: User & { wallet_balance: number };
  amount: number;
  wallet_address: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// Transaction types
export interface Transaction {
  id: string;
  user_id: string;
  type: 'reward' | 'withdrawal' | 'red_packet' | 'adjustment';
  amount: number;
  balance_after: number;
  description?: string;
  reference_id?: string;
  created_at: string;
}

// Settings types
export interface Settings {
  id: string;
  bot_id: string;
  platform_name?: string;
  platform_url?: string;
  required_channel_id?: string;
  required_group_id?: string;
  follow_reward: number;
  bind_reward: number;
  screenshot_reward: number;
  invite_reward: number;
  new_user_credits: number;
  min_withdrawal_amount: number;
  red_packet_min_amount: number;
  red_packet_max_amount: number;
  updated_at: string;
}

// Dashboard stats types
export interface DashboardStats {
  users: {
    total_users: number;
    bound_users: number;
    new_today: number;
    active_today: number;
  };
  transactions: {
    total_rewards: number;
    total_transactions: number;
    rewards_today: number;
  };
  bindings: {
    total_bindings: number;
    pending_bindings: number;
    approved_bindings: number;
  };
  redPackets: {
    total_red_packets: number;
    total_claimed_amount: number;
    active_red_packets: number;
  };
  withdrawals?: {
    pending_withdrawals: number;
    total_withdrawn: number;
  };
}

// Pagination types
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// API Response types
export interface LoginResponse {
  token: string;
  user: AdminUser;
}

export interface ApiError {
  error: string;
  message?: string;
}

// ─── Landing Page（官网）相关类型 ───────────────────────────────────────

export type LangCode = 'zh' | 'en' | 'fr' | 'de' | 'es' | 'ar' | 'ja';

export interface LandingI18nMap {
  zh: string;
  en: string;
  fr: string;
  de: string;
  es: string;
  ar: string;
  ja: string;
}

export interface LandingStats {
  users: number;
  nftProducts: number;
  charityTotal: number;
  countries: number;
}

export interface LandingSocialLinks {
  facebook: string;
  tiktok: string;
  twitter: string;
  telegram: string;
  youtube: string;
  instagram: string;
}

export interface LandingConfig {
  brand: {
    name: string;
    logoUrl: string;
  };
  slogans: LandingI18nMap;
  stats: LandingStats;
  statsOverride: {
    users: number;
    nftProducts: number;
    charityTotal: number;
    countries: number;
  };
  nftProducts: any[];
  charityProjects: any[];
  socialLinks: LandingSocialLinks;
  contact: {
    telegram: string;
  };
  legal: {
    privacy: LandingI18nMap;
    terms: LandingI18nMap;
  };
}

export interface LandingBrandSettings {
  brandName: string;
  slogans: LandingI18nMap;
  statsOverride: {
    users: number;
    nftProducts: number;
    charityTotal: number;
    countries: number;
  };
}

export interface LandingSocialSettings {
  socialLinks: LandingSocialLinks;
  contactTelegram: string;
}