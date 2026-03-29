import React, { useEffect, useState } from 'react';
import { Card, Button, message, Space, Table, Popconfirm, Tag, Row, Col, Spin, Empty, Avatar, Tabs, Select, Dropdown, Modal, Form, InputNumber, Radio } from 'antd';
import { ThunderboltOutlined, ReloadOutlined, SettingOutlined, DownOutlined, DeleteOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';
import dayjs from 'dayjs';

interface TradingPair {
  id: string;
  symbol: string;
  name: string;
  pair_type: string;
  current_price?: number;
  icon_url?: string;
}

interface PricePreset {
  id: string;
  preset_name: string;
  price_data: any;
  duration_seconds: number;
  start_price: number;
  end_price: number;
  is_active: boolean;
  created_at: string;
}

interface TodayResult {
  id: string;
  period_label: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  open_price: string;
  settlement_price: string;
  result_direction: 'up' | 'down' | null;
  up_count: string;
  down_count: string;
}

interface ScheduleEntry {
  seq: number;
  direction: 'up' | 'down';
  consumed: boolean;
  period_label?: string;
}

const DURATION_LABELS: Record<number, string> = {
  60: '1 Min',
  300: '5 Min',
  600: '10 Min',
};

const MODE_LABELS: Record<string, string> = {
  random: '随机模式',
  preset: '预设序列',
  pay_more: '多付模式',
  pay_less: '少付模式',
};

const POSITIVE_COLOR = '#52c41a';
const NEGATIVE_COLOR = '#f5222d';

const DURATIONS = [60, 300, 600];

export const CustomPriceControl: React.FC = () => {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string>('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [openPriceMap, setOpenPriceMap] = useState<Record<string, string | null>>({});
  const [presets, setPresets] = useState<PricePreset[]>([]);
  const [todayResults, setTodayResults] = useState<TodayResult[]>([]);
  const [todayResultsLoading, setTodayResultsLoading] = useState(false);

  // Result-mode state
  const [resultMode, setResultMode] = useState<string>('random');
  const [lockedDuration, setLockedDuration] = useState<number | null>(null);
  const [previewEntries, setPreviewEntries] = useState<ScheduleEntry[]>([]);
  const [resultModeModalOpen, setResultModeModalOpen] = useState(false);
  const [resultModeForm] = Form.useForm();
  const [resultModeLoading, setResultModeLoading] = useState(false);

  useEffect(() => {
    fetchPairs();
  }, []);

  useEffect(() => {
    if (selectedPairId) {
      fetchCurrentPrice();
      fetchPresets();
      fetchTodayResults(selectedPairId);
      fetchResultPreview(selectedPairId);
    }
  }, [selectedPairId]);

  const fetchTodayResults = async (pairId: string) => {
    setTodayResultsLoading(true);
    try {
      const response = await apiClient.getTodayResults(pairId);
      setTodayResults(response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch today results:', error);
    } finally {
      setTodayResultsLoading(false);
    }
  };

  const fetchResultPreview = async (pairId: string) => {
    try {
      const data = await apiClient.getResultPreview(pairId);
      setResultMode(data.mode || 'random');
      setLockedDuration(data.locked_duration ?? null);
      setPreviewEntries(data.preview || []);
    } catch (error: any) {
      // Column may not exist yet (migration not applied) – fail silently
      console.warn('Failed to fetch result preview:', error?.message);
    }
  };

  const fetchPairs = async () => {
    try {
      const [pairsRes, openPriceRes] = await Promise.allSettled([
        apiClient.getTradingPairs(),
        apiClient.getPairsWithOpenPrice(),
      ]);

      const customPairs = pairsRes.status === 'fulfilled'
        ? (pairsRes.value.data || []).filter((p: TradingPair) => p.pair_type === 'custom')
        : [];
      setPairs(customPairs);

      if (customPairs.length > 0 && !selectedPairId) {
        setSelectedPairId(customPairs[0].id);
      }

      if (openPriceRes.status === 'fulfilled') {
        const opData = openPriceRes.value.data || openPriceRes.value || [];
        const map: Record<string, string | null> = {};
        opData.forEach((p: any) => { map[p.id] = p.open_price ?? null; });
        setOpenPriceMap(map);
      }
    } catch (error) {
      console.error('Failed to fetch pairs:', error);
      message.error('获取交易对列表失败');
    }
  };

  const fetchCurrentPrice = async () => {
    if (!selectedPairId) return;
    try {
      const pair = pairs.find(p => p.id === selectedPairId);
      if (pair && pair.current_price !== undefined) {
        setCurrentPrice(pair.current_price);
      }
    } catch (error) {
      console.error('Failed to fetch current price:', error);
    }
  };

  const fetchPresets = async () => {
    if (!selectedPairId) return;
    try {
      const response = await apiClient.getPricePresets(selectedPairId);
      setPresets(response.presets || []);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const handleActivatePreset = async (presetId: string) => {
    try {
      await apiClient.activatePreset(presetId);
      message.success('预设已激活');
      fetchPresets();
    } catch (error: any) {
      console.error('Failed to activate preset:', error);
      message.error(error.response?.data?.error || '激活失败');
    }
  };

  const handleSetResultMode = async (values: any) => {
    if (!selectedPairId) return;
    setResultModeLoading(true);
    try {
      await apiClient.setResultMode(selectedPairId, {
        mode: values.mode,
        duration_seconds: values.duration_seconds,
        preset_periods: values.preset_periods ?? 50,
        up_periods: values.up_periods ?? 0,
        down_periods: values.down_periods ?? 0,
      });
      message.success('开奖模式已设置');
      setResultModeModalOpen(false);
      fetchResultPreview(selectedPairId);
    } catch (error: any) {
      message.error(error.response?.data?.error || '设置失败');
    } finally {
      setResultModeLoading(false);
    }
  };

  const handleClearResultMode = async () => {
    if (!selectedPairId) return;
    try {
      await apiClient.clearResultMode(selectedPairId);
      message.success('开奖模式已清除');
      fetchResultPreview(selectedPairId);
    } catch (error: any) {
      message.error(error.response?.data?.error || '清除失败');
    }
  };

  const selectedPair = pairs.find(p => p.id === selectedPairId);
  const upcomingPreview = previewEntries.filter(e => !e.consumed).slice(0, 12);

  const resultModeMenuItems = [
    {
      key: 'configure',
      label: '配置开奖模式',
      icon: <SettingOutlined />,
      onClick: () => {
        resultModeForm.setFieldsValue({
          mode: resultMode,
          duration_seconds: lockedDuration ?? 60,
          preset_periods: 50,
          up_periods: 0,
          down_periods: 0,
        });
        setResultModeModalOpen(true);
      },
    },
    {
      key: 'clear',
      label: '清除锁定',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: handleClearResultMode,
    },
  ];

  const presetColumns = [
    {
      title: '预设名称',
      dataIndex: 'preset_name',
      key: 'preset_name',
    },
    {
      title: '起始价格',
      dataIndex: 'start_price',
      key: 'start_price',
      render: (price: any) => `$${parseFloat(String(price ?? 0)).toFixed(4)}`,
    },
    {
      title: '结束价格',
      dataIndex: 'end_price',
      key: 'end_price',
      render: (price: any) => `$${parseFloat(String(price ?? 0)).toFixed(4)}`,
    },
    {
      title: '持续时间',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (seconds: any) => `${Math.floor((Number(seconds) || 0) / 60)} 分钟`,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? '运行中' : '未激活'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: PricePreset) => (
        !record.is_active && (
          <Popconfirm
            title="确定要激活这个预设吗？"
            onConfirm={() => handleActivatePreset(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="primary" size="small" icon={<ThunderboltOutlined />}>
              激活
            </Button>
          </Popconfirm>
        )
      ),
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>自定义走势控制</h2>
        <p style={{ color: '#666', marginTop: 4 }}>管理自定义币种的价格走势</p>
      </div>

      {/* Horizontal info bar */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {/* 选择交易对 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666', whiteSpace: 'nowrap' }}>选择交易对</span>
            <Select
              value={selectedPairId || undefined}
              onChange={(val) => setSelectedPairId(val)}
              optionLabelProp="label"
              style={{ minWidth: 160 }}
              placeholder="请选择交易对"
              options={pairs.map((pair) => {
                const label = pair.symbol || pair.name;
                const initials = (pair.symbol || '?').slice(0, 2).toUpperCase();
                return {
                  value: pair.id,
                  label: (
                    <Space size={6}>
                      {pair.icon_url ? (
                        <Avatar src={pair.icon_url} size={20} />
                      ) : (
                        <Avatar size={20} style={{ backgroundColor: '#1677ff', fontSize: 10 }}>
                          {initials}
                        </Avatar>
                      )}
                      {label}
                    </Space>
                  ),
                };
              })}
            />
          </div>

          {/* 当前价格 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666', whiteSpace: 'nowrap' }}>当前价格</span>
            <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#1890ff', fontSize: 16 }}>
              {currentPrice != null
                ? `$${typeof currentPrice === 'number' ? currentPrice.toFixed(4) : parseFloat(String(currentPrice)).toFixed(4)}`
                : '-'}
            </span>
          </div>

          {/* 当前状态 (result mode dropdown) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#666', whiteSpace: 'nowrap' }}>当前状态</span>
            <Dropdown menu={{ items: resultModeMenuItems }} disabled={!selectedPairId}>
              <Button size="small">
                <Space size={4}>
                  <Tag color={resultMode === 'random' ? 'default' : 'blue'} style={{ margin: 0 }}>
                    {MODE_LABELS[resultMode] || resultMode}
                  </Tag>
                  {lockedDuration != null && (
                    <Tag color="orange" style={{ margin: 0 }}>{DURATION_LABELS[lockedDuration] || `${lockedDuration}s`}</Tag>
                  )}
                  <DownOutlined style={{ fontSize: 10 }} />
                </Space>
              </Button>
            </Dropdown>
          </div>

          {/* 未来走势预览 */}
          {upcomingPreview.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ color: '#666', whiteSpace: 'nowrap' }}>未来走势</span>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
                {upcomingPreview.map((entry, idx) => (
                  <Tag
                    key={idx}
                    color={entry.direction === 'up' ? POSITIVE_COLOR : NEGATIVE_COLOR}
                    style={{ margin: 0, padding: '0 4px', fontSize: 11, color: '#fff' }}
                  >
                    {entry.direction === 'up' ? '▲' : '▼'}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Main content area (single column) */}
      {!selectedPairId ? (
        <Empty description="请选择上方交易对进行管理" style={{ marginTop: 80 }} />
      ) : (
        <>
          {/* Open price info */}
          {openPriceMap[selectedPairId] != null && (
            <Card style={{ marginBottom: 16 }}>
              <Space size="large">
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: '#666' }}>
                    当前期开始价
                  </label>
                  <div style={{ fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace', color: '#1677ff' }}>
                    {`$${parseFloat(openPriceMap[selectedPairId]!).toFixed(4)}`}
                  </div>
                </div>
                {selectedPair && (
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: '#666' }}>
                      交易对
                    </label>
                    <Space>
                      {selectedPair.icon_url ? (
                        <Avatar src={selectedPair.icon_url} size={24} />
                      ) : (
                        <Avatar size={24} style={{ backgroundColor: '#1677ff', fontSize: 11 }}>
                          {(selectedPair.symbol || '?').slice(0, 2).toUpperCase()}
                        </Avatar>
                      )}
                      <span style={{ fontWeight: 600 }}>{selectedPair.symbol || selectedPair.name}</span>
                    </Space>
                  </div>
                )}
              </Space>
            </Card>
          )}

          {presets.length > 0 && (
            <Card title="已创建的预设">
              <Table
                columns={presetColumns}
                dataSource={presets}
                rowKey="id"
                pagination={false}
              />
            </Card>
          )}

          {/* Today's settlement results — Tabs by duration */}
          <Card
            title="当天开奖结果"
            style={{ marginTop: 16 }}
            extra={
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => selectedPairId && fetchTodayResults(selectedPairId)}
              >
                刷新
              </Button>
            }
          >
            <Spin spinning={todayResultsLoading}>
              <Tabs
                defaultActiveKey="60"
                items={DURATIONS.map((dur) => {
                  const filtered = todayResults.filter((s) => Number(s.duration_seconds) === dur);
                  const durLabel = DURATION_LABELS[dur] || `${dur}s`;
                  const tableColumns = [
                    {
                      title: '期号/时间',
                      key: 'label',
                      width: 100,
                      render: (_: any, s: TodayResult) =>
                        s.period_label || dayjs(s.start_time).format('HH:mm'),
                    },
                    {
                      title: '开始价格',
                      dataIndex: 'open_price',
                      key: 'open_price',
                      width: 130,
                      render: (v: string) => v ? `$${parseFloat(v).toFixed(4)}` : '-',
                    },
                    {
                      title: '结算价格',
                      dataIndex: 'settlement_price',
                      key: 'settlement_price',
                      width: 130,
                      render: (v: string) => v ? `$${parseFloat(v).toFixed(4)}` : '-',
                    },
                    {
                      title: '结果',
                      dataIndex: 'result_direction',
                      key: 'result_direction',
                      width: 80,
                      render: (d: string | null, record: TodayResult) => {
                        if (d) {
                          return (
                            <Tag color={d === 'up' ? POSITIVE_COLOR : NEGATIVE_COLOR} style={{ color: '#fff' }}>
                              {d === 'up' ? '▲ 涨' : '▼ 跌'}
                            </Tag>
                          );
                        }
                        if (record.open_price && record.settlement_price) {
                          const open = parseFloat(record.open_price);
                          const settle = parseFloat(record.settlement_price);
                          if (!isNaN(open) && !isNaN(settle) && open > 0) {
                            const autoDir = settle >= open ? 'up' : 'down';
                            return (
                              <Tag color={autoDir === 'up' ? POSITIVE_COLOR : NEGATIVE_COLOR} style={{ color: '#fff', opacity: 0.75 }}>
                                {autoDir === 'up' ? '▲ 涨*' : '▼ 跌*'}
                              </Tag>
                            );
                          }
                        }
                        return <Tag color="default">未结算</Tag>;
                      },
                    },
                    {
                      title: '买涨人数',
                      dataIndex: 'up_count',
                      key: 'up_count',
                      width: 90,
                      render: (v: any) => <Tag color="green">{v || 0} 人</Tag>,
                    },
                    {
                      title: '买跌人数',
                      dataIndex: 'down_count',
                      key: 'down_count',
                      width: 90,
                      render: (v: any) => <Tag color="red">{v || 0} 人</Tag>,
                    },
                  ];
                  return {
                    key: String(dur),
                    label: durLabel,
                    children: (
                      <Table
                        dataSource={filtered}
                        columns={tableColumns}
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: 20, hideOnSinglePage: true }}
                        locale={{ emptyText: <Empty description="暂无结算数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                      />
                    ),
                  };
                })}
              />
            </Spin>
          </Card>
        </>
      )}

      {/* Result mode configuration modal */}
      <Modal
        title="配置开奖模式"
        open={resultModeModalOpen}
        onCancel={() => setResultModeModalOpen(false)}
        onOk={() => resultModeForm.submit()}
        confirmLoading={resultModeLoading}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={resultModeForm}
          layout="vertical"
          onFinish={handleSetResultMode}
          initialValues={{ mode: 'random', duration_seconds: 60, preset_periods: 50, up_periods: 0, down_periods: 0 }}
        >
          <Form.Item name="duration_seconds" label="锁定时段">
            <Radio.Group>
              <Radio value={60}>1分钟</Radio>
              <Radio value={300}>5分钟</Radio>
              <Radio value={600}>10分钟</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="mode" label="开奖模式">
            <Radio.Group>
              <Radio value="random">随机（自动生成序列）</Radio>
              <Radio value="preset">预设序列（自定义涨跌比）</Radio>
              <Radio value="pay_more">多付模式（跟随多数）</Radio>
              <Radio value="pay_less">少付模式（对抗多数）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.mode !== cur.mode}
          >
            {({ getFieldValue }) => {
              const mode = getFieldValue('mode');
              if (mode === 'random') {
                return (
                  <Form.Item name="preset_periods" label="预生成期数" rules={[{ required: true }]}>
                    <InputNumber min={1} max={300} style={{ width: '100%' }} />
                  </Form.Item>
                );
              }
              if (mode === 'preset') {
                return (
                  <>
                    <Form.Item name="preset_periods" label="总期数" rules={[{ required: true }]}>
                      <InputNumber min={1} max={300} style={{ width: '100%' }} />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="up_periods" label="涨的期数" rules={[{ required: true }]}>
                          <InputNumber min={0} max={300} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="down_periods" label="跌的期数" rules={[{ required: true }]}>
                          <InputNumber min={0} max={300} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                );
              }
              return null;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
