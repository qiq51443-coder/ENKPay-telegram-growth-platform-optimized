import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  message,
  Popconfirm,
  Switch,
  Tabs,
  TimePicker,
  Upload,
  Divider,
  Card,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { UploadChangeParam, UploadFile } from 'antd/es/upload';
import dayjs from 'dayjs';
import axios from 'axios';
import TranslateButton from '../components/TranslateButton';
import AnimatedEmojiPanel from '../components/AnimatedEmojiPanel';

const { TextArea } = Input;

interface StrategyBot {
  id: string;
  bot_name?: string;
  username?: string;
  is_active: boolean;
  created_at: string;
}

interface StrategyBotGroup {
  id: string;
  strategy_bot_id: string;
  chat_id: string;
  chat_title?: string;
  language?: string;
  is_active: boolean;
  joined_at: string;
}

interface TradingPair {
  id: string | number;
  symbol: string;
  display_name?: string;
  pair_type?: string;
}

interface StrategyConfig {
  id: string;
  strategy_bot_id: string;
  name: string;
  is_active: boolean;
  auto_send_daily: boolean;
  coin_rotation: Array<{ pair_id?: string; symbol?: string; display_name?: string; time_frame?: number }>;
  send_times: string[];
  custom_text?: string;
  custom_text_translations?: Record<string, string>;
  media_url?: string;
  media_telegram_file_id?: string;
  target_group_ids: string[];
  current_coin_index: number;
  bot_name?: string;
  username?: string;
}

interface StrategySendLog {
  created_at: string;
  configId?: string;
  configName?: string;
  periodLabel?: string;
  direction?: string;
  probability?: number;
  groupCount?: number;
  coin?: { symbol?: string; display_name?: string; time_frame?: number };
}

const LANG_OPTIONS = [
  { value: 'zh', label: '中文 (zh)' },
  { value: 'en', label: '英语 (en)' },
  { value: 'ja', label: '日语 (ja)' },
  { value: 'ko', label: '韩语 (ko)' },
  { value: 'ru', label: '俄语 (ru)' },
  { value: 'ar', label: '阿拉伯语 (ar)' },
  { value: 'es', label: '西班牙语 (es)' },
  { value: 'fr', label: '法语 (fr)' },
  { value: 'de', label: '德语 (de)' },
  { value: 'pt', label: '葡萄牙语 (pt)' },
  { value: 'vi', label: '越南语 (vi)' },
  { value: 'th', label: '泰语 (th)' },
];

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

export const TradingStrategyBot: React.FC = () => {
  const [activeTab, setActiveTab] = useState('bots');

  const [bots, setBots] = useState<StrategyBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [botForm] = Form.useForm();

  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [groups, setGroups] = useState<StrategyBotGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StrategyBotGroup | null>(null);
  const [groupForm] = Form.useForm();

  const [pairs, setPairs] = useState<TradingPair[]>([]);

  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StrategyConfig | null>(null);
  const [configForm] = Form.useForm();
  const [contentTranslations, setContentTranslations] = useState<Record<string, string> | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [targetGroupsForConfig, setTargetGroupsForConfig] = useState<StrategyBotGroup[]>([]);

  const [logs, setLogs] = useState<StrategySendLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const watchedRotation = Form.useWatch('coin_rotation', configForm) || [];
  const watchedCustomText = Form.useWatch('custom_text', configForm) || '';

  const firstRotation = watchedRotation?.[0];
  const previewCoin = firstRotation?.display_name || firstRotation?.symbol || '币种';
  const previewMinutes = Number(firstRotation?.time_frame || 60) / 60;

  const activeBots = useMemo(() => bots.filter((b) => b.is_active), [bots]);

  const fetchBots = async () => {
    setBotsLoading(true);
    try {
      const res = await axios.get('/api/strategy-bots', { headers: authHeaders() });
      const list: StrategyBot[] = res.data.bots || [];
      setBots(list);
      if (!selectedBotId && list.length > 0) {
        setSelectedBotId(list[0].id);
      }
    } catch (error) {
      console.error(error);
      message.error('获取策略机器人失败');
    } finally {
      setBotsLoading(false);
    }
  };

  const fetchGroups = async (botId: string) => {
    if (!botId) {
      setGroups([]);
      return;
    }
    setGroupsLoading(true);
    try {
      const res = await axios.get(`/api/strategy-bots/${botId}/groups`, { headers: authHeaders() });
      setGroups(res.data.groups || []);
    } catch (error) {
      console.error(error);
      message.error('获取群组失败');
    } finally {
      setGroupsLoading(false);
    }
  };

  const fetchPairs = async () => {
    try {
      const res = await axios.get('/api/trading/pairs', { headers: authHeaders() });
      const data: TradingPair[] = res.data?.data || [];
      setPairs(data.filter((p) => p.pair_type !== 'custom'));
    } catch (error) {
      console.error(error);
      message.error('获取交易币种失败');
    }
  };

  const fetchConfigs = async () => {
    setConfigsLoading(true);
    try {
      const res = await axios.get('/api/strategy-configs', { headers: authHeaders() });
      setConfigs(res.data.configs || []);
    } catch (error) {
      console.error(error);
      message.error('获取策略配置失败');
    } finally {
      setConfigsLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await axios.get('/api/strategy-configs/send-logs/recent', { headers: authHeaders() });
      setLogs(res.data.logs || []);
    } catch (error) {
      console.error(error);
      message.error('获取发送记录失败');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
    fetchPairs();
    fetchConfigs();
    fetchLogs();
  }, []);

  useEffect(() => {
    if (selectedBotId) fetchGroups(selectedBotId);
  }, [selectedBotId]);

  const openConfigModal = async (cfg?: StrategyConfig) => {
    setEditingConfig(cfg || null);

    if (cfg) {
      setContentTranslations(cfg.custom_text_translations || null);
      setMediaUrl(cfg.media_url || '');
      await fetchGroupsForConfig(cfg.strategy_bot_id);
      configForm.setFieldsValue({
        name: cfg.name,
        strategy_bot_id: cfg.strategy_bot_id,
        is_active: cfg.is_active,
        auto_send_daily: cfg.auto_send_daily,
        coin_rotation: (cfg.coin_rotation || []).map((item: any) => ({
          pair_id: item.pair_id,
          symbol: item.symbol,
          display_name: item.display_name,
          time_frame: item.time_frame || 60,
        })),
        send_times: (cfg.send_times || []).map((t) => dayjs(t, 'HH:mm')),
        target_group_ids: cfg.target_group_ids || [],
        custom_text: cfg.custom_text || '',
      });
    } else {
      setContentTranslations(null);
      setMediaUrl('');
      setTargetGroupsForConfig([]);
      configForm.resetFields();
      configForm.setFieldsValue({
        is_active: true,
        auto_send_daily: false,
        coin_rotation: [{ time_frame: 60 }],
        send_times: [dayjs('00:00', 'HH:mm')],
        target_group_ids: [],
      });
    }

    setConfigModalOpen(true);
  };

  const fetchGroupsForConfig = async (botId: string) => {
    if (!botId) {
      setTargetGroupsForConfig([]);
      return;
    }
    try {
      const res = await axios.get(`/api/strategy-bots/${botId}/groups`, { headers: authHeaders() });
      setTargetGroupsForConfig(res.data.groups || []);
    } catch (error) {
      console.error(error);
      setTargetGroupsForConfig([]);
      message.error('加载目标群组失败');
    }
  };

  const handleAuthorizeBot = async () => {
    try {
      const values = await botForm.validateFields();
      await axios.post('/api/strategy-bots', { token: values.token?.trim() }, { headers: authHeaders() });
      message.success('策略机器人授权成功');
      setBotModalOpen(false);
      botForm.resetFields();
      fetchBots();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '授权失败');
    }
  };

  const toggleBotStatus = async (bot: StrategyBot) => {
    try {
      await axios.patch(`/api/strategy-bots/${bot.id}`, { is_active: !bot.is_active }, { headers: authHeaders() });
      message.success(bot.is_active ? '已停用' : '已启用');
      fetchBots();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const deleteBot = async (id: string) => {
    try {
      await axios.delete(`/api/strategy-bots/${id}`, { headers: authHeaders() });
      message.success('删除成功');
      if (selectedBotId === id) setSelectedBotId('');
      fetchBots();
      fetchGroups(selectedBotId === id ? '' : selectedBotId);
      fetchConfigs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const openGroupModal = (group?: StrategyBotGroup) => {
    setEditingGroup(group || null);
    if (group) {
      groupForm.setFieldsValue({
        chat_id: group.chat_id,
        chat_title: group.chat_title,
        language: group.language,
        is_active: group.is_active,
      });
    } else {
      groupForm.resetFields();
      groupForm.setFieldsValue({ is_active: true });
    }
    setGroupModalOpen(true);
  };

  const saveGroup = async () => {
    if (!selectedBotId) {
      message.warning('请先选择机器人');
      return;
    }
    try {
      const values = await groupForm.validateFields();
      if (editingGroup) {
        await axios.patch(
          `/api/strategy-bots/${selectedBotId}/groups/${editingGroup.id}`,
          {
            chat_title: values.chat_title,
            language: values.language,
            is_active: values.is_active,
          },
          { headers: authHeaders() }
        );
      } else {
        await axios.post(
          `/api/strategy-bots/${selectedBotId}/groups`,
          {
            chat_id: values.chat_id,
            chat_title: values.chat_title,
            language: values.language,
          },
          { headers: authHeaders() }
        );
      }
      message.success('保存成功');
      setGroupModalOpen(false);
      fetchGroups(selectedBotId);
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const deleteGroup = async (groupId: string) => {
    try {
      await axios.delete(`/api/strategy-bots/${selectedBotId}/groups/${groupId}`, { headers: authHeaders() });
      message.success('删除成功');
      fetchGroups(selectedBotId);
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields();

      const selectedPairs = new Map(
        pairs.map((p) => [String(p.id), { symbol: p.symbol, display_name: p.display_name || p.symbol }])
      );

      const payload = {
        name: values.name,
        strategy_bot_id: values.strategy_bot_id,
        is_active: !!values.is_active,
        auto_send_daily: !!values.auto_send_daily,
        coin_rotation: (values.coin_rotation || []).map((item: any) => ({
          pair_id: item.pair_id,
          symbol: selectedPairs.get(String(item.pair_id))?.symbol || item.symbol,
          display_name: selectedPairs.get(String(item.pair_id))?.display_name || item.display_name,
          time_frame: Number(item.time_frame || 60),
        })),
        send_times: (values.send_times || []).map((t: any) => dayjs(t).format('HH:mm')),
        target_group_ids: values.target_group_ids || [],
        custom_text: values.custom_text || '',
        custom_text_translations: contentTranslations || null,
        media_url: mediaUrl || null,
      };

      if (editingConfig) {
        await axios.put(`/api/strategy-configs/${editingConfig.id}`, payload, { headers: authHeaders() });
      } else {
        await axios.post('/api/strategy-configs', payload, { headers: authHeaders() });
      }

      message.success('策略配置保存成功');
      setConfigModalOpen(false);
      fetchConfigs();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const deleteConfig = async (id: string) => {
    try {
      await axios.delete(`/api/strategy-configs/${id}`, { headers: authHeaders() });
      message.success('删除成功');
      fetchConfigs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const sendNow = async (id: string) => {
    try {
      await axios.post(`/api/strategy-configs/${id}/send-now`, {}, { headers: authHeaders() });
      message.success('策略已发送');
      fetchLogs();
      fetchConfigs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '发送失败');
    }
  };

  const botColumns = [
    { title: 'Bot名称', dataIndex: 'bot_name', key: 'bot_name' },
    { title: '@用户名', dataIndex: 'username', key: 'username', render: (v?: string) => (v ? `@${v}` : '-') },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => (v ? <Tag color="success">运行中</Tag> : <Tag>已停用</Tag>),
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, row: StrategyBot) => (
        <Space>
          <Button type="link" onClick={() => { setSelectedBotId(row.id); setActiveTab('bots'); }}>管理群组</Button>
          <Button type="link" onClick={() => toggleBotStatus(row)}>{row.is_active ? '停用' : '启用'}</Button>
          <Popconfirm title="确定删除该机器人？" onConfirm={() => deleteBot(row.id)}>
            <Button type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const groupColumns = [
    { title: '群组名称', dataIndex: 'chat_title', key: 'chat_title', render: (v?: string) => v || '-' },
    { title: 'Chat ID', dataIndex: 'chat_id', key: 'chat_id' },
    { title: '语言', dataIndex: 'language', key: 'language', render: (v?: string) => <Tag>{v || 'zh'}</Tag> },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, row: StrategyBotGroup) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openGroupModal(row)}>编辑</Button>
          <Popconfirm title="确定删除该群组？" onConfirm={() => deleteGroup(row.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const configColumns = [
    { title: '配置名', dataIndex: 'name', key: 'name' },
    {
      title: '机器人',
      key: 'bot',
      render: (_: any, row: StrategyConfig) => (row.username ? `@${row.username}` : row.bot_name || '-'),
    },
    {
      title: '币种轮换预览',
      key: 'rotation',
      render: (_: any, row: StrategyConfig) => (row.coin_rotation || []).map((c: any) => c.display_name || c.symbol).filter(Boolean).join('→') || '-',
    },
    { title: '发送时间', key: 'times', render: (_: any, row: StrategyConfig) => (row.send_times || []).join(', ') || '-' },
    { title: '自动发送', dataIndex: 'auto_send_daily', key: 'auto_send_daily', render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '开启' : '关闭'}</Tag> },
    { title: '状态', dataIndex: 'is_active', key: 'is_active', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, row: StrategyConfig) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openConfigModal(row)}>编辑</Button>
          <Button type="link" icon={<SendOutlined />} onClick={() => sendNow(row.id)}>立即发送</Button>
          <Popconfirm title="确定删除该配置？" onConfirm={() => deleteConfig(row.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const logColumns = [
    { title: '发送时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: '配置名称', dataIndex: 'configName', key: 'configName', render: (v?: string) => v || '-' },
    { title: '币种', key: 'coin', render: (_: any, row: StrategySendLog) => row.coin?.display_name || row.coin?.symbol || '-' },
    { title: '时间周期', key: 'time_frame', render: (_: any, row: StrategySendLog) => row.coin?.time_frame ? `${row.coin.time_frame / 60}分钟` : '-' },
    { title: '期号', dataIndex: 'periodLabel', key: 'periodLabel', render: (v?: string) => v || '-' },
    { title: '方向', dataIndex: 'direction', key: 'direction', render: (v?: string) => (v === 'up' ? '买涨' : v === 'down' ? '买跌' : '-') },
    { title: '概率', dataIndex: 'probability', key: 'probability', render: (v?: number) => (typeof v === 'number' ? `${v}%` : '-') },
    { title: '发送群组数', dataIndex: 'groupCount', key: 'groupCount', render: (v?: number) => (typeof v === 'number' ? v : '-') },
  ];

  return (
    <div>
      <h2>交易策略机器人</h2>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'bots',
          label: '机器人授权',
          children: (
            <>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setBotModalOpen(true)}>授权机器人</Button>
              </div>

              <Table rowKey="id" columns={botColumns} dataSource={bots} loading={botsLoading} pagination={{ pageSize: 10 }} />

              <Divider />

              <Card title="机器人群组管理" size="small">
                <Space style={{ marginBottom: 12 }}>
                  <span>当前机器人：</span>
                  <Select
                    style={{ width: 320 }}
                    value={selectedBotId || undefined}
                    placeholder="请选择机器人"
                    onChange={(v) => setSelectedBotId(v)}
                    options={bots.map((b) => ({ value: b.id, label: b.username ? `@${b.username}` : b.bot_name || b.id }))}
                  />
                  <Button type="primary" onClick={() => openGroupModal()}>手动添加群组</Button>
                </Space>
                <Table rowKey="id" columns={groupColumns} dataSource={groups} loading={groupsLoading} pagination={{ pageSize: 8 }} />
              </Card>

              <Modal
                title="授权机器人"
                open={botModalOpen}
                onOk={handleAuthorizeBot}
                onCancel={() => setBotModalOpen(false)}
                okText="保存"
                cancelText="取消"
              >
                <Form form={botForm} layout="vertical" style={{ marginTop: 16 }}>
                  <Form.Item
                    name="token"
                    label="Bot Token"
                    rules={[{ required: true, message: '请输入 Bot Token' }]}
                    extra="请从 @BotFather 获取 Bot Token，系统将自动验证并获取 Bot 信息"
                  >
                    <Input.TextArea rows={4} placeholder="123456789:ABCxxx" />
                  </Form.Item>
                </Form>
              </Modal>

              <Modal
                title={editingGroup ? '编辑群组' : '手动添加群组'}
                open={groupModalOpen}
                onOk={saveGroup}
                onCancel={() => setGroupModalOpen(false)}
                okText="保存"
                cancelText="取消"
              >
                <Form form={groupForm} layout="vertical" style={{ marginTop: 16 }}>
                  {!editingGroup && (
                    <Form.Item
                      name="chat_id"
                      label="Chat ID"
                      rules={[
                        { required: true, message: '请输入 Chat ID' },
                        { pattern: /^-100\d+$/, message: '格式应为 -100xxx' },
                      ]}
                    >
                      <Input placeholder="-100xxxxxxxxxx" />
                    </Form.Item>
                  )}
                  <Form.Item name="chat_title" label="群组名称">
                    <Input placeholder="可选" />
                  </Form.Item>
                  <Form.Item name="language" label="语言">
                    <Select allowClear options={LANG_OPTIONS} />
                  </Form.Item>
                  {editingGroup && (
                    <Form.Item name="is_active" label="状态" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                  )}
                </Form>
              </Modal>
            </>
          ),
        },
        {
          key: 'configs',
          label: '策略配置',
          children: (
            <>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openConfigModal()}>创建配置</Button>
              </div>

              <Table rowKey="id" columns={configColumns} dataSource={configs} loading={configsLoading} pagination={{ pageSize: 10 }} />

              <Modal
                title={editingConfig ? '编辑策略配置' : '创建策略配置'}
                width={820}
                open={configModalOpen}
                onOk={handleSaveConfig}
                onCancel={() => setConfigModalOpen(false)}
                okText="保存"
                cancelText="取消"
              >
                <Form form={configForm} layout="vertical" style={{ marginTop: 16 }}>
                  <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
                    <Input />
                  </Form.Item>

                  <Form.Item name="strategy_bot_id" label="选择机器人" rules={[{ required: true, message: '请选择机器人' }]}>
                    <Select
                      options={activeBots.map((b) => ({
                        value: b.id,
                        label: b.username ? `@${b.username}` : b.bot_name || b.id,
                      }))}
                      onChange={(v) => {
                        configForm.setFieldValue('target_group_ids', []);
                        fetchGroupsForConfig(v);
                      }}
                    />
                  </Form.Item>

                  <Space style={{ marginBottom: 16 }}>
                    <Form.Item name="is_active" label="启用状态" valuePropName="checked" style={{ marginBottom: 0 }}>
                      <Switch />
                    </Form.Item>
                    <Form.Item name="auto_send_daily" label="每天自动发送" valuePropName="checked" style={{ marginBottom: 0 }}>
                      <Switch />
                    </Form.Item>
                  </Space>

                  <Divider orientation="left">多币种交替设置</Divider>
                  <div style={{ marginBottom: 8, color: '#666' }}>每次发送时按顺序取下一个币种，发完一轮重新循环。发送内容为"下一期"的策略。</div>

                  <Form.List name="coin_rotation">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map((field) => (
                          <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'pair_id']}
                              rules={[{ required: true, message: '请选择币种' }]}
                            >
                              <Select
                                style={{ width: 280 }}
                                placeholder="币种"
                                options={pairs.map((p) => ({ value: String(p.id), label: `${p.display_name || p.symbol} (${p.symbol})` }))}
                                onChange={(v) => {
                                  const pair = pairs.find((p) => String(p.id) === String(v));
                                  configForm.setFieldValue(['coin_rotation', field.name, 'symbol'], pair?.symbol || '');
                                  configForm.setFieldValue(['coin_rotation', field.name, 'display_name'], pair?.display_name || pair?.symbol || '');
                                }}
                              />
                            </Form.Item>
                            <Form.Item
                              {...field}
                              name={[field.name, 'time_frame']}
                              rules={[{ required: true, message: '请选择周期' }]}
                            >
                              <Select
                                style={{ width: 180 }}
                                options={[
                                  { label: '1分钟', value: 60 },
                                  { label: '5分钟', value: 300 },
                                  { label: '10分钟', value: 600 },
                                ]}
                              />
                            </Form.Item>
                            <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add({ time_frame: 60 })} icon={<PlusOutlined />}>+ 添加币种</Button>
                      </>
                    )}
                  </Form.List>

                  <Divider orientation="left">发送计划</Divider>
                  <Form.List name="send_times">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map((field) => (
                          <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                            <Form.Item
                              {...field}
                              name={field.name}
                              rules={[{ required: true, message: '请选择发送时间' }]}
                            >
                              <TimePicker format="HH:mm" minuteStep={1} />
                            </Form.Item>
                            <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add(dayjs('00:00', 'HH:mm'))} icon={<PlusOutlined />}>+ 添加时间</Button>
                        <div style={{ marginTop: 8, color: '#666' }}>所有时间均为 UTC，服务器将在整分钟自动执行</div>
                      </>
                    )}
                  </Form.List>

                  <Divider orientation="left">目标群组</Divider>
                  <Form.Item name="target_group_ids" label="目标群组" rules={[{ required: true, message: '请选择目标群组' }]}>
                    <Select
                      mode="multiple"
                      options={targetGroupsForConfig.map((g) => ({
                        value: String(g.chat_id),
                        label: `${g.chat_title || '未命名群组'}（${g.chat_id}）[${g.language || 'zh'}]`,
                      }))}
                    />
                  </Form.Item>

                  <Divider orientation="left">消息内容</Divider>
                  <Form.Item name="custom_text" label="自定义附加文本（中文）">
                    <TextArea rows={4} />
                  </Form.Item>

                  <Form.Item label="自动翻译" colon={false}>
                    <TranslateButton text={configForm.getFieldValue('custom_text') || ''} onTranslated={(t) => setContentTranslations(t)} />
                  </Form.Item>

                  <Form.Item label="插入表情" colon={false}>
                    <AnimatedEmojiPanel
                      onInsert={(tag) => {
                        const current = configForm.getFieldValue('custom_text') || '';
                        configForm.setFieldValue('custom_text', `${current}${tag}`);
                      }}
                    />
                  </Form.Item>

                  <Form.Item label="媒体文件（图片/GIF）" extra="支持 JPG/PNG/GIF，最大 10MB">
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
                            message.success('媒体上传成功');
                          }
                        } else if (info.file.status === 'removed') {
                          setMediaUrl('');
                        } else if (info.file.status === 'error') {
                          message.error('媒体上传失败');
                        }
                      }}
                    >
                      <Button icon={<UploadOutlined />}>点击上传</Button>
                    </Upload>
                    {mediaUrl && <img src={mediaUrl} alt="预览" style={{ marginTop: 8, maxHeight: 120, maxWidth: '100%', borderRadius: 4 }} />}
                  </Form.Item>

                  <Divider orientation="left">消息预览</Divider>
                  <Card size="small" style={{ background: '#fafafa', whiteSpace: 'pre-wrap' }}>
{`📊 ${previewCoin} · ${previewMinutes}分钟

🔢 期号：（实际发送时自动生成）
建议：买涨/买跌（示意，实际随机）
🎯 概率：xx%（示意，实际随机）

💬 ${watchedCustomText || ''}`}
                  </Card>
                </Form>
              </Modal>
            </>
          ),
        },
        {
          key: 'logs',
          label: '发送记录',
          children: (
            <>
              <div style={{ marginBottom: 16 }}>
                <Button onClick={fetchLogs}>刷新</Button>
              </div>
              <Table rowKey={(r) => `${r.created_at}-${r.configId || Math.random()}`} columns={logColumns} dataSource={logs} loading={logsLoading} pagination={{ pageSize: 20 }} />
            </>
          ),
        },
      ]} />
    </div>
  );
};
