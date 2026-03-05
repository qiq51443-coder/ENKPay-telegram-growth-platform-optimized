export interface Transaction {
  id: string | number;
  type: string;
  amount: number;
  description: string;
  created_at: string;
  balance_after?: number;
  reference_id?: string | number;
}

export interface Settings {
  follow_reward?: number;
  bind_reward?: number;
  welcome_message?: string;
  webapp_url?: string;
  support_telegram?: string;
  required_channel_id?: string;
  required_group_id?: string;
  [key: string]: unknown;
}
