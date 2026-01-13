import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Modal, Input, Button, Select, Popconfirm } from 'antd';
import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Broadcast {
  id: string;
  bot_id: string;
  title: string;
  content: string;
  target_type: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
  sent_count?: number;
  failed_count?: number;
  created_at: string;
}

interface Bot {
  id: string;
  name: string;
}

export const Broadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    bot_id: '',
    title: '',
    content: '',
    target_type: 'all',
  });

  useEffect(() => {
    fetchBroadcasts();
    fetchBots();
  }, []);

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/broadcasts');
      setBroadcasts(response.data.broadcasts || []);
    } catch (error) {
      console.error('Failed to fetch broadcasts:', error);
      message.error('获取广播列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const response = await axios.get('/api/admin/bots');
      setBots(response.data.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const handleCreate = async () => {
    if (!formData.bot_id || !formData.title || !formData.content) {
      message.error('请填写所有必填字段');
      return;
    }
    try {
      await axios.post('/api/admin/broadcasts', formData);
      message.success('广播创建成功');
      setModalOpen(false);
      setFormData({
        bot_id: '',
        title: '',
        content: '',
        target_type: 'all',
      });
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to create broadcast:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await axios.post(`/api/admin/broadcasts/${id}/send`);
      message.success('广播发送成功');
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to send broadcast:', error);
      message.error(error.response?.data?.error || '发送失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      render: (content: string) => (
        <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {content}
        </div>
      ),
    },
    {
      title: '目标用户',
      dataIndex: 'target_type',
      key: 'target_type',
      render: (type: string) => {
        const targetMap: Record<string, string> = {
          all: '全部用户',
          active: '活跃用户',
          bound: '已绑定',
          unbound: '未绑定',
        };
        return targetMap[type] || type;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: { [key: string]: { text: string; color: string } } = {
          draft: { text: '草稿', color: 'default' },
          scheduled: { text: '已安排', color: 'processing' },
          sending: { text: '发送中', color: 'warning' },
          completed: { text: '已完成', color: 'success' },
          failed: { text: '失败', color: 'error' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '统计',
      key: 'stats',
      render: (_: any, record: Broadcast) =>
        record.sent_count ? (
          <div style={{ fontSize: '12px' }}>
            <div style={{ color: '#52c41a' }}>成功: {record.sent_count}</div>
            {record.failed_count ? (
              <div style={{ color: '#ff4d4f' }}>失败: {record.failed_count}</div>
            ) : null}
          </div>
        ) : (
          '-'
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: Broadcast) =>
        record.status === 'draft' ? (
          <Popconfirm
            title="确定要立即发送这条广播吗？"
            onConfirm={() => handleSend(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="primary" size="small" icon={<SendOutlined />}>
              发送
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>广播通知</h2>
          <p style={{ color: '#666' }}>创建和发送广播消息</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          创建广播
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={broadcasts}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      {/* Create Modal */}
      <Modal
        title="创建广播"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setFormData({
            bot_id: '',
            title: '',
            content: '',
            target_type: 'all',
          });
        }}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>选择 Bot *</label>
            <Select
              value={formData.bot_id}
              onChange={(value) => setFormData({ ...formData, bot_id: value })}
              style={{ width: '100%' }}
              placeholder="请选择 Bot"
              options={bots.map(bot => ({ value: bot.id, label: bot.name }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>标题 *</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="广播标题"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>内容 *</label>
            <TextArea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={5}
              placeholder="输入广播内容..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>目标用户</label>
            <Select
              value={formData.target_type}
              onChange={(value) => setFormData({ ...formData, target_type: value })}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '全部用户' },
                { value: 'active', label: '活跃用户' },
                { value: 'bound', label: '已绑定用户' },
                { value: 'unbound', label: '未绑定用户' },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
