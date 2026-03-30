import React, { useEffect, useState } from 'react';
import { Table, message, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, Upload, Collapse, Switch } from 'antd';
import { PlusOutlined, SendOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadChangeParam, UploadFile } from 'antd/es/upload';
import { apiClient } from '../services/api';
import TranslateButton from '../components/TranslateButton';

const { TextArea } = Input;

const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ar: 'العربية',
  ja: '日本語',
};

interface Broadcast {
  id: string;
  bot_id: string;
  title: string;
  content: string;
  target_type: string;
  target_users?: string;
  status: string;
  sent_count?: number;
  failed_count?: number;
  created_at: string;
  sent_at?: string;
  media_url?: string;
  content_translations?: Record<string, string>;
  title_translations?: Record<string, string>;
  pin_message?: boolean;
}

interface Bot {
  id: string;
  name: string;
  username?: string;
}

export const Broadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [targetType, setTargetType] = useState<string>('all');
  const [pinMessage, setPinMessage] = useState<boolean>(false);
  const [contentTranslations, setContentTranslations] = useState<Record<string, string> | null>(null);
  const [titleTranslations, setTitleTranslations] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    fetchBroadcasts();
    fetchBots();
  }, []);

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getBroadcasts();
      setBroadcasts(response.broadcasts || []);
    } catch (error) {
      console.error('Failed to fetch broadcasts:', error);
      message.error('获取广播列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const resetModal = () => {
    setModalOpen(false);
    form.resetFields();
    setMediaUrl('');
    setTargetType('all');
    setPinMessage(false);
    setContentTranslations(null);
    setTitleTranslations(null);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await apiClient.createBroadcast({
        ...values,
        media_url: mediaUrl || undefined,
        pin_message: pinMessage,
        content_translations: contentTranslations || undefined,
        title_translations: titleTranslations || undefined,
      });
      message.success('广播创建成功');
      resetModal();
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to create broadcast:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await apiClient.sendBroadcast(id);
      message.success('广播发送中...');
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to send broadcast:', error);
      message.error(error.response?.data?.error || '发送失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteBroadcast(id);
      message.success('广播删除成功');
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to delete broadcast:', error);
      message.error(error.response?.data?.error || '删除失败');
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
      ellipsis: true,
      width: 300,
      render: (content: string, record: Broadcast) => (
        <div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{content}</div>
          {record.content_translations && Object.keys(record.content_translations).length > 0 ? (
            <Tag color="green" style={{ marginTop: 4, fontSize: 11 }}>✓ 已翻译为{Object.keys(record.content_translations).length}种语言</Tag>
          ) : (
            <Tag color="default" style={{ marginTop: 4, fontSize: 11 }}>翻译中...</Tag>
          )}
        </div>
      ),
    },
    {
      title: '目标用户',
      dataIndex: 'target_type',
      key: 'target_type',
      width: 120,
      render: (target_type: string) => {
        const targetMap: Record<string, string> = {
          all: '全部用户',
          active: '活跃用户',
          specific: '指定用户',
        };
        return targetMap[target_type] || target_type;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          draft: { text: '草稿', color: 'default' },
          scheduled: { text: '已安排', color: 'processing' },
          sending: { text: '发送中', color: 'warning' },
          sent: { text: '已发送', color: 'success' },
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
      width: 120,
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
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: Broadcast) => (
        <Space>
          {record.status === 'draft' && (
            <Popconfirm
              title="确定要发送这条广播吗？"
              onConfirm={() => handleSend(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" icon={<SendOutlined />}>
                发送
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="确定要删除这条广播吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
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
        <div>
          <h2 style={{ margin: 0 }}>广播管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和发送广播消息</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          创建广播
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={broadcasts}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="创建广播"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={resetModal}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="bot_id"
            label="选择 Bot"
            rules={[{ required: true, message: '请选择 Bot' }]}
          >
            <Select placeholder="请选择...">
              {bots.map((bot) => (
                <Select.Option key={bot.id} value={bot.id}>
                  {bot.username ? `@${bot.username}` : bot.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入广播标题' }]}
          >
            <Input placeholder="广播标题" />
          </Form.Item>

          <Form.Item label="标题翻译" colon={false}>
            <TranslateButton
              text={form.getFieldValue('title') || ''}
              onTranslated={(t) => {
                setTitleTranslations(t);
              }}
            />
          </Form.Item>

          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入广播内容' }]}
          >
            <TextArea rows={5} placeholder="输入广播内容..." />
          </Form.Item>

          <Form.Item label="内容翻译" colon={false}>
            <TranslateButton
              text={form.getFieldValue('content') || ''}
              onTranslated={(t) => {
                setContentTranslations(t);
              }}
            />
          </Form.Item>

          {contentTranslations && Object.keys(contentTranslations).length > 0 && (
            <Collapse
              size="small"
              style={{ marginBottom: 16 }}
              items={[{
                key: 'translations',
                label: (
                  <span>
                    🌐 翻译预览
                    <Tag color="cyan" style={{ marginLeft: 8, fontSize: 10 }}>已翻译 {Object.keys(contentTranslations).length} 种语言</Tag>
                  </span>
                ),
                children: (
                  <div>
                    {Object.entries(contentTranslations).map(([lang, text]) => (
                      <div key={lang} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8 }}>
                        <Tag style={{ width: 80, textAlign: 'center', flexShrink: 0, marginTop: 2 }}>
                          {LANG_LABELS[lang] || lang}
                        </Tag>
                        <div style={{ flex: 1, fontSize: 12, color: '#555', paddingLeft: 8 }}>{text}</div>
                      </div>
                    ))}
                  </div>
                ),
              }]}
            />
          )}

          <Form.Item
            name="target_type"
            label="目标用户"
            rules={[{ required: true, message: '请选择目标用户' }]}
            initialValue="all"
          >
            <Select onChange={(val) => setTargetType(val)}>
              <Select.Option value="all">全部用户</Select.Option>
              <Select.Option value="active">活跃用户</Select.Option>
              <Select.Option value="specific">指定用户</Select.Option>
            </Select>
          </Form.Item>

          {targetType === 'specific' && (
            <Form.Item
              name="target_users"
              label="指定用户标识"
              rules={[{ required: true, message: '请输入至少一个用户标识' }]}
              extra="支持 Telegram 数字ID、@用户名、平台用户名/unique_id，多个用户以逗号或换行分隔"
            >
              <TextArea
                rows={4}
                placeholder={"示例：123456789, @username\nanother_user"}
              />
            </Form.Item>
          )}

          <Form.Item label="媒体（图片/GIF）" extra="支持 JPG/PNG/GIF，最大 10MB">
            <Upload
              name="file"
              listType="picture"
              maxCount={1}
              accept="image/*,.gif"
              action="/api/admin/upload-broadcast-image"
              headers={{ Authorization: `Bearer ${localStorage.getItem('token') || ''}` }}
              onChange={(info: UploadChangeParam<UploadFile>) => {
                if (info.file.status === 'done') {
                  const url = info.file.response?.url;
                  if (url) {
                    setMediaUrl(url);
                    message.success('图片上传成功');
                  }
                } else if (info.file.status === 'removed') {
                  setMediaUrl('');
                } else if (info.file.status === 'error') {
                  message.error('图片上传失败');
                }
              }}
            >
              <Button icon={<UploadOutlined />}>点击上传</Button>
            </Upload>
            {mediaUrl && (
              <img src={mediaUrl} alt="预览" style={{ marginTop: 8, maxHeight: 120, maxWidth: '100%', borderRadius: 4 }} />
            )}
            <Collapse
              size="small"
              style={{ marginTop: 8 }}
              items={[{
                key: 'url',
                label: '或直接输入媒体 URL',
                children: (
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                ),
              }]}
            />
          </Form.Item>

          <Form.Item label="置顶消息">
            <Switch
              checked={pinMessage}
              onChange={(checked) => setPinMessage(checked)}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
            <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>发送后自动置顶消息（需要 Bot 有置顶权限）</span>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
