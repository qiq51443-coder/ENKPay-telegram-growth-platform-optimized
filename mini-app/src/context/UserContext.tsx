import React, { createContext, useContext, useState, useCallback } from 'react';
import { getUserProfile } from '../services/api';
import { useTelegram } from '../hooks/useTelegram';

export interface UserProfile {
  id?: string;
  unique_id: string;
  telegram_id?: number;
  balance: number;
  wallet_balance?: number;
  reward_balance?: number;
  nft_balance?: number;
  red_packet_balance?: number;
  red_packet_credits?: number;
  frozen_balance?: number;
  tradable_balance?: number;
  account_status?: string;
  wallet_tip_message?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  invite_code?: string;
  invited_by?: string;
  invite_count?: number;
  reward_unlock_progress?: number;
  reward_unlock_required?: number;
  total_recharged?: number;
  total_withdrawn?: number;
}

interface UserContextType {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  /** Lightweight balance refresh — calls GET /miniapp/profile, never authSync */
  refreshBalance: () => Promise<void>;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  refreshBalance: async () => {},
  loading: true,
  setLoading: () => {},
  error: null,
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { initData } = useTelegram();

  // Lightweight refresh — only calls GET /miniapp/profile, never triggers auth-sync
  const refreshBalance = useCallback(async () => {
    try {
      const data = await getUserProfile(initData || undefined);
      const profileData: UserProfile | null = data.user || data;
      if (profileData) {
        setUser(profileData);
        setError(null);
      }
    } catch (err: any) {
      console.warn('[UserContext] refreshBalance error:', err?.message);
      // Keep existing user data on refresh failure — don't clear the profile
    }
  }, [initData]);

  return (
    <UserContext.Provider value={{ user, setUser, refreshBalance, loading, setLoading, error }}>
      {children}
    </UserContext.Provider>
  );
}
