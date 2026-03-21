import React, { useEffect, useState } from 'react';
import { Card, Button, Form, InputNumber, message, Select, Space, Table, Input, Popconfirm, Tag, DatePicker, Row, Col, Spin, Empty, Avatar } from 'antd';
import { PlusOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
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

const DURATION_LABELS: Record<number, string> = {
  60: '1 Min',
  300: '5 Min',
  600: '10 Min',
};

const DURATIONS = [60, 300, 600];

const ResultColumn: React.FC<{ sessions: TodayResult[]; duration: number }> = ({ sessions, duration }) => {
  const filtered = sessions.filter((s) => Number(s.duration_seconds) === duration);
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, borderBottom: '1px solid #f0f0f0', paddingBottom: 4 }}>
        {DURATION_LABELS[duration] || `${duration}s`}
      </div>
      {filtered.length === 0 ? (
        <Empty description="暂无结算数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        filtered.map((s) => (
          <Card
            key={s.id}
            size="small"
            style={{ marginBottom: 8 }}
            bodyStyle={{ padding: '8px 12px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>
                {s.period_label || dayjs(s.start_time).format('HH:mm')}
              </span>
              {s.result_direction ? (
                <Tag color={s.result_direction === 'up' ? 'green' : 'red'} style={{ margin: 0 }}>
                  {s.result_direction === 'up' ? '▲ 涨' : '▼ 跌'}
                </Tag>
              ) : (
                <Tag color="default" style={{ margin: 0 }}>未结算</Tag>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              <span>开: {s.open_price ? `$${parseFloat(s.open_price).toFixed(4)}` : '-'}</span>
              <span style={{ margin: '0 8px' }}>→</span>
              <span>收: {s.settlement_price ? `$${parseFloat(s.settlement_price).toFixed(4)}` : '-'}</span>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              <Tag color="green" style={{ fontSize: 10 }}>买涨 {s.up_count || 0}人</Tag>
              <Tag color="red" style={{ fontSize: 10 }}>买跌 {s.down_count || 0}人</Tag>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};

export const CustomPriceControl: React.FC = () => {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string>('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [presets, setPresets] = useState<PricePreset[]>([]);
  const [addPointForm] = Form.useForm();
  const [presetForm] = Form.useForm();
  const [todayResults, setTodayResults] = useState<TodayResult[]>([]);
  const [todayResultsLoading, setTodayResultsLoading] = useState(false);

  useEffect(() => {
    fetchPairs();
  }, []);

  useEffect(() => {
    if (selectedPairId) {
      fetchCurrentPrice();
      fetchPresets();
      fetchTodayResults(selectedPairId);
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

  const fetchPairs = async () => {
    try {
      const response = await apiClient.getTradingPairs();
      const customPairs = (response.data || []).filter((p: TradingPair) => p.pair_type === 'custom');
      setPairs(customPairs);
      
      if (customPairs.length > 0 && !selectedPairId) {
        setSelectedPairId(customPairs[0].id);
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

  const handleAddPricePoint = async () => {
    try {
      const values = await addPointForm.validateFields();
      
      // Convert timestamp to ISO string if present
      if (values.timestamp) {
        values.timestamp = values.timestamp.toISOString();
      }
      
      await apiClient.addPricePoint(selectedPairId, values);
      message.success('价格点添加成功');
      
      addPointForm.resetFields();
      fetchCurrentPrice();
    } catch (error: any) {
      console.error('Failed to add price point:', error);
      message.error(error.response?.data?.error || '添加失败');
    }
  };

  const handleCreatePreset = async () => {
    try {
      const values = await presetForm.validateFields();
      
      // Parse price_data as JSON
      if (values.price_data && typeof values.price_data === 'string') {
        try {
          values.price_data = JSON.parse(values.price_data);
        } catch (e) {
          message.error('价格数据格式错误，请输入有效的 JSON');
          return;
        }
      }
      
      await apiClient.createPricePreset(selectedPairId, values);
      message.success('预设创建成功');
      
      presetForm.resetFields();
      fetchPresets();
    } catch (error: any) {
      console.error('Failed to create preset:', error);
      message.error(error.response?.data?.error || '创建失败');
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
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>自定义走势控制</h2>
        <p style={{ color: '#666', marginTop: 4 }}>管理自定义币种的价格走势</p>
      </div>

      <Row gutter={16}>
        {/* Left: custom pair card list */}
        <Col xs={24} sm={5}>
          <Card bodyStyle={{ padding: '12px 8px' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, paddingLeft: 4 }}>选择交易对</div>
            {pairs.length === 0 ? (
              <Empty description="暂无自定义币种" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pairs.map((pair) => {
                  const label = pair.symbol || pair.name;
                  const initials = (pair.symbol || '?').slice(0, 2).toUpperCase();
                  const isSelected = selectedPairId === pair.id;
                  return (
                    <div
                      key={pair.id}
                      onClick={() => setSelectedPairId(pair.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: isSelected ? '2px solid #1677ff' : '2px solid #f0f0f0',
                        background: isSelected ? '#e6f4ff' : '#fff',
                        transition: 'all 0.15s',
                      }}
                    >
                      {pair.icon_url ? (
                        <Avatar src={pair.icon_url} size={32} />
                      ) : (
                        <Avatar size={32} style={{ backgroundColor: '#1677ff', fontSize: 12 }}>
                          {initials}
                        </Avatar>
                      )}
                      <span style={{ fontWeight: isSelected ? 600 : 400, fontSize: 13, lineHeight: 1.2 }}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>

        {/* Right: control panel */}
        <Col xs={24} sm={19}>
          {!selectedPairId ? (
            <Empty description="请点击左侧币种进行管理" style={{ marginTop: 80 }} />
          ) : (
            <>
              {currentPrice !== null && (
                <Card style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    当前价格
                  </label>
                  <div style={{ fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace', color: '#1890ff' }}>
                    ${typeof currentPrice === 'number' ? currentPrice.toFixed(4) : parseFloat(String(currentPrice ?? 0)).toFixed(4)}
                  </div>
                </Card>
              )}

          <Card title="手动添加价格点" style={{ marginBottom: 16 }}>
            <Form
              form={addPointForm}
              layout="inline"
              onFinish={handleAddPricePoint}
            >
              <Form.Item
                name="price"
                label="价格"
                rules={[{ required: true, message: '请输入价格' }]}
              >
                <InputNumber
                  min={0.0001}
                  step={0.01}
                  placeholder="0.00"
                  style={{ width: 150 }}
                />
              </Form.Item>

              <Form.Item
                name="timestamp"
                label="时间戳"
                tooltip="留空则使用当前时间"
              >
                <DatePicker showTime style={{ width: 200 }} />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                  添加
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="预设走势管理" style={{ marginBottom: 16 }}>
            <Form
              form={presetForm}
              layout="vertical"
              onFinish={handleCreatePreset}
            >
              <Form.Item
                name="preset_name"
                label="预设名称"
                rules={[{ required: true, message: '请输入预设名称' }]}
              >
                <Input placeholder="例如：上涨趋势" style={{ width: 300 }} />
              </Form.Item>

              <Space size="large" align="start">
                <Form.Item
                  name="start_price"
                  label="起始价格"
                  rules={[{ required: true, message: '请输入起始价格' }]}
                >
                  <InputNumber min={0.0001} step={0.01} placeholder="0.00" />
                </Form.Item>

                <Form.Item
                  name="end_price"
                  label="结束价格"
                  rules={[{ required: true, message: '请输入结束价格' }]}
                >
                  <InputNumber min={0.0001} step={0.01} placeholder="0.00" />
                </Form.Item>

                <Form.Item
                  name="duration_seconds"
                  label="持续时间（秒）"
                  rules={[{ required: true, message: '请输入持续时间' }]}
                >
                  <InputNumber min={60} step={60} placeholder="3600" />
                </Form.Item>
              </Space>

              <Form.Item
                name="price_data"
                label="价格数据 (JSON)"
                rules={[{ required: true, message: '请输入价格数据' }]}
                tooltip='格式: [{"timestamp": "2024-01-01T00:00:00Z", "price": 1.23}, ...]'
              >
                <Input.TextArea
                  rows={4}
                  placeholder='[{"timestamp": "2024-01-01T00:00:00Z", "price": 1.23}]'
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                  创建预设
                </Button>
              </Form.Item>
            </Form>
          </Card>

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

          {/* Today's settlement results for the selected custom pair */}
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
              <Row gutter={12}>
                {DURATIONS.map((dur) => (
                  <Col key={dur} xs={24} sm={8} style={{ marginBottom: 8 }}>
                    <ResultColumn sessions={todayResults} duration={dur} />
                  </Col>
                ))}
              </Row>
            </Spin>
          </Card>
            </>
          )}
        </Col>
      </Row>
    </div>
  );
};
