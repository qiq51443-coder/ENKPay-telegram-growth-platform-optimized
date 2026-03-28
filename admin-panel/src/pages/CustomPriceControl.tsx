import React, { useEffect, useState } from 'react';
import { Card, Button, message, Space, Table, Popconfirm, Tag, Row, Col, Spin, Empty, Avatar, Tabs } from 'antd';
import { ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isSelected ? 600 : 400, fontSize: 13, lineHeight: 1.2 }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 11, color: '#1677ff', marginTop: 2 }}>
                          开: {openPriceMap[pair.id] != null ? `$${parseFloat(openPriceMap[pair.id]!).toFixed(4)}` : '-'}
                        </div>
                      </div>
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
                  <Space size="large">
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: '#666' }}>
                        当前价格
                      </label>
                      <div style={{ fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace', color: '#1890ff' }}>
                        ${typeof currentPrice === 'number' ? currentPrice.toFixed(4) : parseFloat(String(currentPrice ?? 0)).toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: '#666' }}>
                        当前期开始价
                      </label>
                      <div style={{ fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace', color: '#1677ff' }}>
                        {openPriceMap[selectedPairId] != null ? `$${parseFloat(openPriceMap[selectedPairId]!).toFixed(4)}` : '-'}
                      </div>
                    </div>
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
        </Col>
      </Row>
    </div>
  );
};
