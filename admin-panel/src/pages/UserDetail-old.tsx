import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Loading } from '../components/Common/Loading';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import { Table } from '../components/Common/Table';
import apiClient from '../services/api';
import { User, Transaction } from '../services/types';

export const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    balance: 0,
    red_packet_credits: 0,
    account_status: 'active',
  });

  useEffect(() => {
    if (id) {
      fetchUser();
      fetchTransactions();
    }
  }, [id]);

  const fetchUser = async () => {
    try {
      const response = await apiClient.getUser(id!);
      setUser(response.user);
      setFormData({
        balance: response.user.balance,
        red_packet_credits: response.user.red_packet_credits,
        account_status: response.user.account_status,
      });
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await apiClient.getUserTransactions(id!, { limit: 20 });
      setTransactions(response.transactions || []);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.updateUser(id!, formData);
      alert('保存成功');
      fetchUser();
    } catch (error) {
      console.error('Failed to update user:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-8">用户不存在</div>
      </Layout>
    );
  }

  const transactionColumns = [
    {
      key: 'type',
      title: '类型',
      render: (tx: Transaction) => {
        const typeMap: Record<string, string> = {
          reward: '奖励',
          withdrawal: '提现',
          red_packet: '红包',
          adjustment: '调整',
        };
        return typeMap[tx.type] || tx.type;
      },
    },
    {
      key: 'amount',
      title: '金额',
      render: (tx: Transaction) => (
        <span className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
          {tx.amount >= 0 ? '+' : ''}${tx.amount.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'balance_after',
      title: '余额',
      render: (tx: Transaction) => `$${tx.balance_after.toFixed(2)}`,
    },
    {
      key: 'description',
      title: '说明',
      render: (tx: Transaction) => tx.description || '-',
    },
    {
      key: 'created_at',
      title: '时间',
      render: (tx: Transaction) => new Date(tx.created_at).toLocaleString('zh-CN'),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={() => navigate('/users')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户详情</h1>
            <p className="text-gray-600 mt-1">{user.username || user.first_name}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">基本信息</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Telegram ID</label>
                <p className="font-medium">{user.telegram_id}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">用户名</label>
                <p className="font-medium">{user.username || '未设置'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">姓名</label>
                <p className="font-medium">
                  {user.first_name} {user.last_name || ''}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Bot ID</label>
                <p className="font-medium">{user.robot_user_id || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">邀请码</label>
                <p className="font-medium font-mono">{user.invite_code}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">绑定状态</label>
                <p className="font-medium">{user.binding_status}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">注册时间</label>
                <p className="font-medium">
                  {new Date(user.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">编辑信息</h2>
            <div className="space-y-4">
              <Input
                label="余额"
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) =>
                  setFormData({ ...formData, balance: parseFloat(e.target.value) })
                }
              />
              <Input
                label="红包积分"
                type="number"
                value={formData.red_packet_credits}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    red_packet_credits: parseInt(e.target.value),
                  })
                }
              />
              <Select
                label="账号状态"
                value={formData.account_status}
                onChange={(e) =>
                  setFormData({ ...formData, account_status: e.target.value })
                }
                options={[
                  { value: 'active', label: '正常' },
                  { value: 'suspended', label: '暂停' },
                  { value: 'banned', label: '封禁' },
                ]}
              />
              <Button
                onClick={handleSave}
                loading={saving}
                variant="primary"
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                保存修改
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">交易记录</h2>
          </div>
          <Table
            columns={transactionColumns}
            data={transactions}
            emptyText="暂无交易记录"
          />
        </div>
      </div>
    </Layout>
  );
};
