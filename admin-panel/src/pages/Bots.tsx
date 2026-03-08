import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface Bot {
  id: string;
  name: string;
  token: string;
  username?: string;
  is_active: boolean;
  webhook_url?: string;
  default_language?: string;
  welcome_message?: string;
  created_at: string;
}

const LANGUAGES = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'zh', label: '🇨🇳 中文' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'ar', label: '🇸🇦 العربية' },
  { value: 'ja', label: '🇯🇵 日本語' },
];

export const Bots: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
      message.error('获取 Bot 列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (bot?: Bot) => {
    if (bot) {
      setEditingBot(bot);
      form.setFieldsValue({
        token: bot.token,
        default_language: bot.default_language || 'en',
        welcome_message: bot.welcome_message || '',
      });
    } else {
      setEditingBot(null);
      form.resetFields();
      form.setFieldsValue({ default_language: 'en' });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingBot) {
        await apiClient.updateBot(editingBot.id, {
          default_language: values.default_language,
          welcome_message: values.welcome_message,
        });
        message.success('Bot 更新成功');
        setModalOpen(false);
        fetchBots();
      } else {
        // Support multiple tokens (one per line)
        const tokens: string[] = (values.token as string)
          .split('\n')
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);

        if (tokens.length === 0) {
          message.error('请输入至少一个 Bot Token');
          return;
        }

        if (tokens.length === 1) {
          setBatchLoading(true);
          try {
            await apiClient.createBot({
              token: tokens[0],
              default_language: values.default_language,
              welcome_message: values.welcome_message,
            });
            message.success('Bot 授权成功');
            setModalOpen(false);
            fetchBots();
          } finally {
            setBatchLoading(false);
          }
        } else {
          // Batch add
          setBatchLoading(true);
          let successCount = 0;
          let failCount = 0;
          const errors: string[] = [];

          for (const token of tokens) {
            try {
              await apiClient.createBot({
                token,
                default_language: values.default_language,
                welcome_message: values.welcome_message,
              });
              successCount++;
            } catch (err: any) {
              failCount++;
              errors.push(`${token.substring(0, 10)}...: ${err.response?.data?.error || err.message}`);
            }
          }

          setBatchLoading(false);

          if (successCount > 0 && failCount === 0) {
            message.success(`成功添加 ${successCount} 个 Bot`);
          } else if (successCount > 0 && failCount > 0) {
            message.warning(`成功 ${successCount} 个，失败 ${failCount} 个`);
          } else {
            message.error(`全部失败（共 ${failCount} 个）`);
          }

          setModalOpen(false);
          fetchBots();
        }
      }
    } catch (error: any) {
      console.error('Failed to save bot:', error);
      message.error(error.response?.data?.error || '操作失败，请重试');
    }
  };

  const handleResetWebhook = async (bot: Bot) => {
    try {
      const result = await apiClient.resetBotWebhook(bot.id);
      message.success(`Webhook 已重置: ${result.webhookUrl}`);
      fetchBots();
    } catch (error: any) {
      console.error('Failed to reset webhook:', error);
      message.error(error.response?.data?.error || 'Webhook 重置失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteBot(id);
      message.success('Bot 删除成功');
      fetchBots();
    } catch (error: any) {
      console.error('Failed to delete bot:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (bot: Bot) => {
    try {
      await apiClient.updateBot(bot.id, {
        is_active: !bot.is_active,
      });
      message.success(bot.is_active ? 'Bot 已停用' : 'Bot 已启用');
      fetchBots();
    } catch (error: any) {
      console.error('Failed to toggle bot status:', error);
      message.error('状态切换失败');
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
      title: 'Bot 名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username?: string) => username ? `@${username}` : '-',
    },
    {
      title: '默认语言',
      dataIndex: 'default_language',
      key: 'default_language',
      render: (lang?: string) => {
        const found = LANGUAGES.find(l => l.value === lang);
        return found ? found.label : (lang || 'en');
      },
    },
    {
      title: 'Webhook URL',
      dataIndex: 'webhook_url',
      key: 'webhook_url',
      ellipsis: true,
      width: 220,
      render: (url?: string) => url ? (
        <Tooltip title={url}>
          <Space size={4}>
            <span style={{ fontSize: 12, color: '#666' }}>{url.length > 40 ? `...${url.slice(-35)}` : url}</span>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => { navigator.clipboard.writeText(url); message.success('已复制'); }}
            />
          </Space>
        </Tooltip>
      ) : <span style={{ color: '#ccc' }}>未设置</span>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active: boolean) =>
        is_active ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            运行中
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="default">
            已停用
          </Tag>
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
      width: 200,
      render: (_: any, record: Bot) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Button
            type="text"
            size="small"
            onClick={() => handleToggleStatus(record)}
          >
            {record.is_active ? '停用' : '启用'}
          </Button>
          <Popconfirm
            title="重新设置 Webhook？"
            description="这将向 Telegram 重新注册 Webhook 地址"
            onConfirm={() => handleResetWebhook(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
            >
              重置 Webhook
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确定要删除这个 Bot 吗？"
            description="这将删除 Bot 的 Webhook 并清除所有相关数据"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Bot 管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          授权 Bot
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={bots}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingBot ? '编辑 Bot' : '授权 Bot'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={batchLoading}
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          {!editingBot && (
            <Form.Item
              name="token"
              label="Bot Token"
              rules={[{ required: true, message: '请输入 Bot Token' }]}
              extra="支持同时添加多个 Token，每行一个。粘贴从 @BotFather 获取的 Token，系统将自动验证并获取 Bot 信息"
            >
              <Input.TextArea
                rows={4}
                placeholder={"1234567890:ABCdefGHIjklMNOpqrsTUVwxyz\n9876543210:XYZabcDEFghiJKLmnoPQRstuVWX"}
              />
            </Form.Item>
          )}

          <Form.Item
            name="default_language"
            label="默认语言"
            initialValue="en"
          >
            <Select>
              {LANGUAGES.map(l => (
                <Select.Option key={l.value} value={l.value}>{l.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="welcome_message"
            label="欢迎语（留空使用默认）"
          >
            <Input.TextArea
              rows={4}
              placeholder="用户关注 Bot 后显示的欢迎消息，支持 HTML 格式"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
