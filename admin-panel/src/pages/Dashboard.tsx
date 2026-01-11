import React, { useEffect, useState } from 'react';
import { Users, Wallet, Gift, CheckCircle, TrendingUp, Clock } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Loading } from '../components/Common/Loading';
import apiClient from '../services/api';
import { DashboardStats } from '../services/types';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const data = await apiClient.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }

  const statCards = [
    {
      title: '总用户数',
      value: stats?.users.total_users || 0,
      icon: Users,
      color: 'bg-blue-500',
      detail: `已绑定: ${stats?.users.bound_users || 0}`,
    },
    {
      title: '今日新增',
      value: stats?.users.new_today || 0,
      icon: TrendingUp,
      color: 'bg-green-500',
      detail: `活跃: ${stats?.users.active_today || 0}`,
    },
    {
      title: '待审核绑定',
      value: stats?.bindings.pending_bindings || 0,
      icon: Clock,
      color: 'bg-yellow-500',
      detail: `已通过: ${stats?.bindings.approved_bindings || 0}`,
    },
    {
      title: '活跃红包',
      value: stats?.redPackets.active_red_packets || 0,
      icon: Gift,
      color: 'bg-red-500',
      detail: `已发送: ${stats?.redPackets.total_red_packets || 0}`,
    },
    {
      title: '总奖励发放',
      value: `$${(stats?.transactions.total_rewards || 0).toFixed(2)}`,
      icon: Wallet,
      color: 'bg-purple-500',
      detail: `今日: $${(stats?.transactions.rewards_today || 0).toFixed(2)}`,
    },
    {
      title: '红包已领取',
      value: `$${(stats?.redPackets.total_claimed_amount || 0).toFixed(2)}`,
      icon: CheckCircle,
      color: 'bg-indigo-500',
      detail: `总红包: ${stats?.redPackets.total_red_packets || 0}`,
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>
          <p className="text-gray-600 mt-1">系统概览与统计数据</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((card, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {card.value}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{card.detail}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {stats?.withdrawals && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">提现统计</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">待处理提现</p>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {stats.withdrawals.pending_withdrawals}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">总提现金额</p>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  ${stats.withdrawals.total_withdrawn.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
          <h2 className="text-xl font-semibold mb-2">快捷操作</h2>
          <p className="text-purple-100 mb-4">常用管理功能入口</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/bindings"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 text-center transition-all"
            >
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <span className="text-sm">审核绑定</span>
            </a>
            <a
              href="/screenshots"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 text-center transition-all"
            >
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <span className="text-sm">审核截图</span>
            </a>
            <a
              href="/red-packets"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 text-center transition-all"
            >
              <Gift className="w-8 h-8 mx-auto mb-2" />
              <span className="text-sm">发红包</span>
            </a>
            <a
              href="/broadcasts"
              className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 text-center transition-all"
            >
              <TrendingUp className="w-8 h-8 mx-auto mb-2" />
              <span className="text-sm">发广播</span>
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
};
