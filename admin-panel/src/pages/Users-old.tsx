import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Eye } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Pagination } from '../components/Common/Pagination';
import { Input } from '../components/Forms/Input';
import { Button } from '../components/Forms/Button';
import apiClient from '../services/api';
import { User } from '../services/types';

export const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  useEffect(() => {
    fetchUsers();
  }, [currentPage, search]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getUsers({
        page: currentPage,
        limit,
        search,
      });
      setUsers(response.users || []);
      setTotalPages(response.pagination?.pages || 1);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers();
  };

  const columns = [
    {
      key: 'telegram_id',
      title: 'Telegram ID',
      render: (user: User) => user.telegram_id,
    },
    {
      key: 'username',
      title: '用户名',
      render: (user: User) => (
        <div>
          <p className="font-medium">{user.username || '未设置'}</p>
          <p className="text-xs text-gray-500">{user.first_name}</p>
        </div>
      ),
    },
    {
      key: 'robot_user_id',
      title: 'Bot ID',
      render: (user: User) => user.robot_user_id || '-',
    },
    {
      key: 'balance',
      title: '余额',
      render: (user: User) => (
        <span className="font-mono">${user.balance.toFixed(2)}</span>
      ),
    },
    {
      key: 'red_packet_credits',
      title: '红包积分',
      render: (user: User) => user.red_packet_credits,
    },
    {
      key: 'binding_status',
      title: '绑定状态',
      render: (user: User) => {
        const statusMap = {
          unbound: { text: '未绑定', color: 'bg-gray-100 text-gray-800' },
          pending: { text: '待审核', color: 'bg-yellow-100 text-yellow-800' },
          bound: { text: '已绑定', color: 'bg-green-100 text-green-800' },
        };
        const status = statusMap[user.binding_status];
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${status.color}`}>
            {status.text}
          </span>
        );
      },
    },
    {
      key: 'account_status',
      title: '账号状态',
      render: (user: User) => {
        const statusMap = {
          active: { text: '正常', color: 'bg-green-100 text-green-800' },
          suspended: { text: '暂停', color: 'bg-yellow-100 text-yellow-800' },
          banned: { text: '封禁', color: 'bg-red-100 text-red-800' },
        };
        const status = statusMap[user.account_status];
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${status.color}`}>
            {status.text}
          </span>
        );
      },
    },
    {
      key: 'actions',
      title: '操作',
      render: (user: User) => (
        <Link to={`/users/${user.id}`}>
          <Button variant="secondary" className="text-xs py-1 px-2">
            <Eye className="w-4 h-4 mr-1" />
            查看
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <p className="text-gray-600 mt-1">查看和管理所有用户</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex gap-4">
            <Input
              placeholder="搜索用户名、Bot ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} variant="primary">
              <Search className="w-4 h-4 mr-2" />
              搜索
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={users} loading={loading} />
          {totalPages > 1 && (
            <div className="p-4 border-t">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
