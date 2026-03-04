import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

interface Group {
  id: string;
  bot_id: string;
  bot_name?: string;
  bot_username?: string;
  group_id: string;
  group_name: string;
  group_type?: string;
  joined_at: string;
}

export const Groups: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/bot-auth/groups', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      message.error('获取群组列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/bot-auth/groups/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      message.success('群组已移除');
      fetchGroups();
    } catch (error: any) {
      console.error('Failed to delete group:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: 'Chat ID',
      dataIndex: 'group_id',
      key: 'group_id',
      render: (group_id: string) => <span style={{ fontFamily: 'monospace' }}>{group_id}</span>,
    },
    {
      title: '群组名称',
      dataIndex: 'group_name',
      key: 'group_name',
      render: (name: string) => name || '-',
    },
    {
      title: '类型',
      dataIndex: 'group_type',
      key: 'group_type',
      render: (type?: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          group: { text: '群组', color: 'blue' },
          supergroup: { text: '超级群组', color: 'green' },
          channel: { text: '频道', color: 'purple' },
        };
        const t = typeMap[type || ''] || { text: type || 'group', color: 'default' };
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '所属 Bot',
      key: 'bot',
      render: (_: any, record: Group) => (
        <span>{record.bot_name || record.bot_id}{record.bot_username ? ` (@${record.bot_username})` : ''}</span>
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      key: 'joined_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: Group) => (
        <Space>
          <Popconfirm
            title="确定要移除这个群组吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              移除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>已授权群组</h2>
          <p style={{ color: '#666', marginTop: 4 }}>Bot 所在的群组列表（Bot 被添加到群组后自动记录）</p>
        </div>
        <Button onClick={fetchGroups}>刷新</Button>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 800 }}
      />
    </div>
  );
};
