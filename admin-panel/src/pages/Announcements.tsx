import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, message, Popconfirm, DatePicker, Upload, Collapse,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadChangeParam, UploadFile } from 'antd/es/upload';
import axios from 'axios';
import TranslateButton from '../components/TranslateButton';
import AnimatedEmojiPanel from '../components/AnimatedEmojiPanel';

const { TextArea } = Input;

interface Announcement {
  id: string;
  title: string;
  content: string;
  images: string[];
  targets: string[];
  scheduled_at?: string;
  expires_at?: string;
  is_pinned: boolean;
  show_on_app_launch: boolean;
  status: string;
  sent_at?: string;
  created_at: string;
  announcement_bot_id?: string;
  target_group_ids?: string[];
  content_translations?: Record<string, string>;
  title_translations?: Record<string, string>;
  sent_message_ids?: Record<string, number>;
  support_telegram?: string;
  show_open_bot_button?: boolean;
}

interface Bot {
  id: string;
  name: string;
  username?: string;
}

interface AuthorizedGroup {
  id: string;
  chat_id: string;
  chat_title: string;
  chat_type?: string;
}

const TARGET_OPTIONS = [
  { label: '群组', value: 'groups' },
  { label: '用户', value: 'users' },
  { label: 'App', value: 'app' },
];

const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ar: 'العربية',
  ja: '日本語',
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [form] = Form.useForm();
  const [bots, setBots] = useState<Bot[]>([]);
  const [groups, setGroups] = useState<AuthorizedGroup[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [contentTranslations, setContentTranslations] = useState<Record<string, string> | null>(null);
  const [titleTranslations, setTitleTranslations] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    fetchAnnouncements();
    fetchBots();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/announcements', { headers: authHeaders() });
      setAnnouncements(response.data.announcements || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      message.error('获取公告列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const response = await axios.get('/api/admin/bots', { headers: authHeaders() });
      setBots(response.data.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const fetchGroupsForBot = async (botId: string) => {
    if (!botId) { setGroups([]); return; }
    try {
      const response = await axios.get(`/api/admin/bots/${botId}/groups`, { headers: authHeaders() });
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      message.error('获取群组列表失败');
      setGroups([]);
    }
  };

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      const targets = announcement.targets || [];
      setSelectedTargets(targets);
      setMediaUrl(announcement.images?.[0] || '');
      form.setFieldsValue({
        title: announcement.title,
        content: announcement.content,
        targets,
        is_pinned: announcement.is_pinned,
        show_on_app_launch: announcement.show_on_app_launch,
        announcement_bot_id: announcement.announcement_bot_id || undefined,
        target_group_ids: announcement.target_group_ids || [],
        support_telegram: announcement.support_telegram || '',
        show_open_bot_button: announcement.show_open_bot_button || false,
      });
      if (announcement.announcement_bot_id) {
        fetchGroupsForBot(announcement.announcement_bot_id);
      }
    } else {
      setEditingAnnouncement(null);
      setSelectedTargets([]);
      setMediaUrl('');
      setGroups([]);
      setContentTranslations(null);
      setTitleTranslations(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const images = mediaUrl ? [mediaUrl] : (editingAnnouncement?.images || []);

      if (!values.title && !values.content && images.length === 0) {
        message.error('请至少填写标题、内容或上传图片之一');
        return;
      }

      const payload = {
        ...values,
        images,
        scheduled_at: values.scheduled_at?.toISOString?.() || values.scheduled_at || null,
        expires_at: values.expires_at?.toISOString?.() || values.expires_at || null,
        announcement_bot_id: values.announcement_bot_id || null,
        target_group_ids: values.target_group_ids || [],
        content_translations: contentTranslations || undefined,
        title_translations: titleTranslations || undefined,
      };

      if (editingAnnouncement) {
        await axios.put(`/api/announcements/${editingAnnouncement.id}`, payload, { headers: authHeaders() });
        message.success('公告更新成功');
      } else {
        await axios.post('/api/announcements', payload, { headers: authHeaders() });
        message.success('公告创建成功');
      }

      setModalOpen(false);
      setMediaUrl('');
      setGroups([]);
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to save announcement:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await axios.post(`/api/announcements/${id}/send`, {}, { headers: authHeaders() });
      message.success('公告已发送');
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to send announcement:', error);
      message.error(error.response?.data?.error || '发送失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/announcements/${id}`, { headers: authHeaders() });
      message.success('公告已删除');
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to delete announcement:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleDeleteMessages = async (id: string) => {
    try {
      const response = await axios.delete(`/api/announcements/${id}/messages`, { headers: authHeaders() });
      message.success(`已删除 ${response.data.deleted_count} 条消息`);
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to delete announcement messages:', error);
      message.error(error.response?.data?.error || '删除消息失败');
    }
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    draft: { text: '草稿', color: 'default' },
    scheduled: { text: '定时', color: 'processing' },
    sent: { text: '已发送', color: 'success' },
    expired: { text: '已过期', color: 'error' },
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: Announcement) => (
        <div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {record.content_translations && Object.keys(record.content_translations).length > 0 ? (
            <Tag color="green" style={{ marginTop: 4, fontSize: 11 }}>✓ 已翻译为{Object.keys(record.content_translations).length}种语言</Tag>
          ) : (
            <Tag color="default" style={{ marginTop: 4, fontSize: 11 }}>翻译中...</Tag>
          )}
        </div>
      ),
    },
    {
      title: '发送目标',
      dataIndex: 'targets',
      key: 'targets',
      render: (targets: string[]) => (
        <>
          {(targets || []).map(t => {
            const opt = TARGET_OPTIONS.find(o => o.value === t);
            return <Tag key={t}>{opt?.label || t}</Tag>;
          })}
        </>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const s = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '置顶',
      dataIndex: 'is_pinned',
      key: 'is_pinned',
      render: (v: boolean) => v ? <Tag color="gold">置顶</Tag> : '-',
    },
    {
      title: 'App启动公告',
      dataIndex: 'show_on_app_launch',
      key: 'show_on_app_launch',
      render: (v: boolean) => v ? <Tag color="blue">是</Tag> : '-',
    },
    {
      title: '客服',
      dataIndex: 'support_telegram',
      key: 'support_telegram',
      render: (v: string) => v ? `@${v}` : '-',
    },
    {
      title: '打开Bot按钮',
      dataIndex: 'show_open_bot_button',
      key: 'show_open_bot_button',
      render: (v: boolean) => v ? <Tag color="cyan">是</Tag> : '-',
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
      width: 220,
      render: (_: any, record: Announcement) => (
        <Space>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(record)}>
            编辑
          </Button>
          {record.status !== 'sent' && (
            <Popconfirm
              title="确定要立即发送这条公告吗？"
              onConfirm={() => handleSend(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" size="small" icon={<SendOutlined />}>
                发送
              </Button>
            </Popconfirm>
          )}
          {record.sent_message_ids && typeof record.sent_message_ids === 'object' && Object.keys(record.sent_message_ids).length > 0 && (
            <Popconfirm
              title="确定要删除所有已发送的 Telegram 消息吗？"
              onConfirm={() => handleDeleteMessages(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" size="small" danger>
                删除已发消息
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="确定要删除这条公告吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
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
        <h2 style={{ margin: 0 }}>公告管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          创建公告
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={announcements}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingAnnouncement ? '编辑公告' : '创建公告'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false);
          setMediaUrl('');
          setGroups([]);
          setSelectedTargets([]);
          setContentTranslations(null);
          setTitleTranslations(null);
        }}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="title"
            label="标题"
          >
            <Input placeholder="公告标题" />
          </Form.Item>

          <Form.Item label="标题翻译" colon={false}>
            <TranslateButton
              text={form.getFieldValue('title') || ''}
              onTranslated={(t) => setTitleTranslations(t)}
            />
          </Form.Item>

          <Form.Item
            label="标题动态表情"
            extra="点击插入动态表情到标题末尾"
          >
            <AnimatedEmojiPanel
              onInsert={(tag) => {
                const current = form.getFieldValue('title') || '';
                form.setFieldValue('title', current + tag);
              }}
            />
          </Form.Item>

          <Form.Item
            name="content"
            label="内容"
          >
            <TextArea rows={5} placeholder="公告内容（支持 HTML 格式）" />
          </Form.Item>

          <Form.Item label="内容翻译" colon={false}>
            <TranslateButton
              text={form.getFieldValue('content') || ''}
              onTranslated={(t) => setContentTranslations(t)}
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
            label="内容动态表情"
            extra="点击插入动态表情到内容末尾"
          >
            <AnimatedEmojiPanel
              onInsert={(tag) => {
                const current = form.getFieldValue('content') || '';
                form.setFieldValue('content', current + tag);
              }}
            />
          </Form.Item>

          <Form.Item name="targets" label="发送目标">
            <Select
              mode="multiple"
              placeholder="选择发送目标（可多选）"
              onChange={(vals: string[]) => setSelectedTargets(vals)}
            >
              {TARGET_OPTIONS.map(o => (
                <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          {(selectedTargets.includes('groups') || selectedTargets.includes('users')) && (
            <Form.Item
              name="announcement_bot_id"
              label="目标 Bot"
              rules={[{ required: true, message: '请选择用于发送的 Bot' }]}
            >
              <Select
                placeholder="请选择 Bot..."
                onChange={(val: string) => {
                  form.setFieldValue('target_group_ids', []);
                  fetchGroupsForBot(val);
                }}
              >
                {bots.map((bot) => (
                  <Select.Option key={bot.id} value={bot.id}>
                    {bot.username ? `@${bot.username}` : bot.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {selectedTargets.includes('groups') && (
            <Form.Item
              name="target_group_ids"
              label="目标群组/频道"
              rules={[{ required: true, message: '请选择至少一个群组或频道' }]}
            >
              <Select
                mode="multiple"
                placeholder={groups.length > 0 ? '请选择群组/频道...' : '暂无群组，请先选择 Bot'}
                options={groups.map((g) => ({
                  value: String(g.chat_id),
                  label: g.chat_title ? `${g.chat_title} (${g.chat_id})` : String(g.chat_id),
                }))}
              />
            </Form.Item>
          )}

          <Form.Item label="媒体（图片/GIF）" extra="支持 JPG/PNG/GIF，最大 10MB">
            <Upload
              name="file"
              listType="picture"
              maxCount={1}
              accept="image/*,.gif"
              action="/api/admin/upload-announcement-image"
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

          <Form.Item name="scheduled_at" label="定时发送（留空立即发送）">
            <DatePicker showTime style={{ width: '100%' }} placeholder="选择发送时间" />
          </Form.Item>

          <Form.Item name="expires_at" label="公告过期时间（留空永久）">
            <DatePicker showTime style={{ width: '100%' }} placeholder="选择过期时间" />
          </Form.Item>

          <Form.Item name="is_pinned" label="置顶" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>

          <Form.Item
            name="show_on_app_launch"
            label="App 启动时显示"
            valuePropName="checked"
            initialValue={false}
            extra={!selectedTargets.includes('app') ? '仅限发送目标包含"App"时有效' : undefined}
          >
            <Switch disabled={!selectedTargets.includes('app')} />
          </Form.Item>

          <Form.Item
            name="support_telegram"
            label="客服 Telegram（可选）"
            extra="填写不含@的用户名，用户点击后直接打开聊天。不填则不显示按钮。"
          >
            <Input addonBefore="@" placeholder="例如：support_bot" />
          </Form.Item>

          <Form.Item
            name="show_open_bot_button"
            label='显示"打开Bot"按钮'
            valuePropName="checked"
            initialValue={false}
            extra="仅对群组/频道公告有效，用户点击可直接打开Bot（未注册用户可借此注册）"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
