import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  InputNumber,
  Select,
  message,
  Tag,
  Space,
  Descriptions,
  Card,
  Row,
  Col,
  Spin,
  Empty,
  Avatar,
  Tabs,
} from 'antd';
import { ThunderboltOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Option } = Select;

const DURATION_LABELS: Record<number, string> = {
  60: '1 Min',
  300: '5 Min',
  600: '10 Min',
};

const DURATIONS = [60, 300, 600];

interface TodayResult {
  id: string;
  period_label: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  open_price: string;
  settlement_price: string;
  result_direction: 'up' | 'down' | null;
  status: string;
  up_count: string;
  down_count: string;
}

interface TradingPair {
  id: string;
  symbol: string;
  name?: string;
  display_name?: string;
  pair_type: string;
  icon_url?: string;
}

interface PairWithOpenPrice {
  id: string;
  symbol: string;
  display_name?: string;
  current_price?: number;
  open_price?: string | null;
  is_active?: boolean;
}

interface TradingOrder {
  id: string;
  telegram_id?: string;
  username?: string;
  first_name?: string;
  symbol: string;
  display_name: string;
  direction: 'up' | 'down';
  amount: string;
  odds: string;
  entry_price: string;
  settlement_price?: string;
  status: string;
  result?: string;
  profit?: string;
  period_label?: string;
  created_at: string;
}

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

export const TradingSessions: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [form] = Form.useForm();

  // Coin list + today's results
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [todayResults, setTodayResults] = useState<TodayResult[]>([]);
  const [todayResultsLoading, setTodayResultsLoading] = useState(false);
  const [openPriceMap, setOpenPriceMap] = useState<Record<string, string | null>>({});

  // Recent trading orders
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    fetchSessions();
    fetchPairs();
    fetchOrders();
  }, []);

  useEffect(() => {
    if (selectedPairId) {
      fetchTodayResults(selectedPairId);
    }
  }, [selectedPairId]);

  // Auto-refresh today's results and open prices every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedPairId) fetchTodayResults(selectedPairId);
      fetchPairs();
    }, 10000);
    return () => clearInterval(timer);
  }, [selectedPairId]);

  const fetchPairs = async () => {
    setPairsLoading(true);
    try {
      const [pairsRes, openPriceRes] = await Promise.allSettled([
        api.getTradingPairs(),
        api.getPairsWithOpenPrice(),
      ]);

      const allPairs: TradingPair[] = pairsRes.status === 'fulfilled' ? (pairsRes.value.data || []) : [];
      const nonCustom = allPairs.filter((p) => p.pair_type !== 'custom');
      setPairs(nonCustom);
      if (nonCustom.length > 0 && !selectedPairId) {
        setSelectedPairId(nonCustom[0].id);
      }

      if (openPriceRes.status === 'fulfilled') {
        const opData: PairWithOpenPrice[] = openPriceRes.value.data || openPriceRes.value || [];
        const map: Record<string, string | null> = {};
        opData.forEach((p) => { map[p.id] = p.open_price ?? null; });
        setOpenPriceMap(map);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取币种列表失败');
    } finally {
      setPairsLoading(false);
    }
  };

  const fetchTodayResults = async (pairId: string) => {
    setTodayResultsLoading(true);
    try {
      const response = await api.getTodayResults(pairId);
      setTodayResults(response.data || []);
    } catch (error: any) {
      message.error({ content: error.response?.data?.error || '获取开奖结果失败', key: 'today-results-error', duration: 3 });
    } finally {
      setTodayResultsLoading(false);
    }
  };

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await api.getTradingSessions();
      setSessions(response.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取交易时段失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const response = await api.getTradingOrders({ limit: 100 });
      setOrders(response.data || []);
    } catch (error: any) {
      console.error('获取交易订单失败', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleSettle = (record: any) => {
    setSelectedSession(record);
    form.resetFields();
    form.setFieldsValue({
      result_direction: record.rule_direction || 'up',
      settlement_price: record.entry_price ? parseFloat(record.entry_price) : 0,
    });
    setSettleModalVisible(true);
  };

  const handleSettleSubmit = async (values: any) => {
    if (!selectedSession) return;

    setLoading(true);
    try {
      const response = await api.settleSession(selectedSession.id, values);
      message.success('结算成功');
      setSettleModalVisible(false);

      const result = response.data;
      Modal.info({
        title: '结算结果',
        content: (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="总订单数">{result.total_orders}</Descriptions.Item>
            <Descriptions.Item label="盈利订单">{result.winning_orders}</Descriptions.Item>
            <Descriptions.Item label="亏损订单">{result.losing_orders}</Descriptions.Item>
            <Descriptions.Item label="总下注金额">${(result.total_bet_amount ?? 0).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="总派奖金额">${(result.total_payout ?? 0).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="平台利润">
              <span style={{ color: (result.platform_profit ?? 0) >= 0 ? 'green' : 'red' }}>
                ${(result.platform_profit ?? 0).toFixed(2)}
              </span>
            </Descriptions.Item>
          </Descriptions>
        ),
      });

      fetchSessions();
      if (selectedPairId) fetchTodayResults(selectedPairId);
    } catch (error: any) {
      message.error(error.response?.data?.error || '结算失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (record: any) => {
    setSelectedSession(record);
    setDetailModalVisible(true);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '交易对',
      dataIndex: 'pair_display_name',
      key: 'pair_display_name',
      render: (text: string, record: any) => text || record.pair_symbol,
    },
    {
      title: '期号',
      dataIndex: 'period_label',
      key: 'period_label',
      render: (v: string) => v || '-',
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      key: 'end_time',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'blue',
          settled: 'green',
          expired: 'red',
        };
        const labelMap: Record<string, string> = {
          active: '进行中',
          settled: '已结算',
          expired: '已过期',
        };
        return <Tag color={colorMap[status] || 'default'}>{labelMap[status] || status.toUpperCase()}</Tag>;
      },
    },
    {
      title: '规则',
      dataIndex: 'rule_name',
      key: 'rule_name',
      render: (text: string, record: any) => (
        text ? (
          <Space>
            <span>{text}</span>
            <Tag color={record.rule_direction === 'up' ? 'green' : 'red'}>
              {record.rule_direction === 'up' ? '涨' : '跌'}
            </Tag>
          </Space>
        ) : '-'
      ),
    },
    {
      title: '结果',
      dataIndex: 'result_direction',
      key: 'result_direction',
      render: (direction: string) => (
        direction ? (
          <Tag color={direction === 'up' ? 'green' : 'red'}>{direction === 'up' ? '涨' : '跌'}</Tag>
        ) : '-'
      ),
    },
    {
      title: '总下注',
      dataIndex: 'total_bet_amount',
      key: 'total_bet_amount',
      render: (value: any) => value ? `$${parseFloat(value).toFixed(2)}` : '-',
    },
    {
      title: '总派奖',
      dataIndex: 'total_payout',
      key: 'total_payout',
      render: (value: any) => value ? `$${parseFloat(value).toFixed(2)}` : '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            详情
          </Button>
          {record.status === 'active' && (
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => handleSettle(record)}
            >
              结算
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const selectedPairName = pairs.find((p) => p.id === selectedPairId);

  const tabItems = [60, 300, 600].map((dur) => {
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
        render: (d: string | null) =>
          d ? (
            <Tag color={d === 'up' ? '#52c41a' : '#ff4d4f'} style={{ color: '#fff' }}>
              {d === 'up' ? '▲ 涨' : '▼ 跌'}
            </Tag>
          ) : (
            <Tag color="default">未结算</Tag>
          ),
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
  });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>交易结算管理 (Trading Sessions)</h2>
      </div>

      {/* Today's results section */}
      <Card
        title="当天开奖结果"
        style={{ marginBottom: 24 }}
        extra={
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => {
              if (selectedPairId) fetchTodayResults(selectedPairId);
              api.getPairsWithOpenPrice().then((res: any) => {
                const opData: PairWithOpenPrice[] = res.data || res || [];
                const map: Record<string, string | null> = {};
                opData.forEach((p) => { map[p.id] = p.open_price ?? null; });
                setOpenPriceMap(map);
              }).catch(() => {/* ignore */});
            }}
          >
            刷新
          </Button>
        }
      >
        <Row gutter={16}>
          {/* Left: pair list as card items */}
          <Col xs={24} sm={6} md={5} lg={4}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>选择币种</div>
            <Spin spinning={pairsLoading}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pairs.map((pair) => {
                  const label = pair.display_name || pair.symbol;
                  const initials = (pair.symbol || '?').slice(0, 2).toUpperCase();
                  const isSelected = selectedPairId === pair.id;
                  const openPrice = openPriceMap[pair.id];
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
                        {openPrice != null && (
                          <div style={{ fontSize: 11, color: '#1677ff', marginTop: 2 }}>
                            开: ${parseFloat(openPrice).toFixed(4)}
                          </div>
                        )}
                        {openPrice == null && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>开: -</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {pairs.length === 0 && !pairsLoading && (
                  <span style={{ color: '#999', fontSize: 12 }}>暂无非自定义币种</span>
                )}
              </div>
            </Spin>
          </Col>

          {/* Right: Tabs (1分钟 / 5分钟 / 10分钟) */}
          <Col xs={24} sm={18} md={19} lg={20}>
            {selectedPairId ? (
              <>
                <div style={{ marginBottom: 8, color: '#666' }}>
                  {selectedPairName?.display_name || selectedPairName?.symbol} — 今日 UTC 0点至今
                  {openPriceMap[selectedPairId] != null && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      当前期开始价: ${parseFloat(openPriceMap[selectedPairId]!).toFixed(4)}
                    </Tag>
                  )}
                </div>
                <Spin spinning={todayResultsLoading}>
                  <Tabs items={tabItems} defaultActiveKey="60" />
                </Spin>
              </>
            ) : (
              <Empty description="请选择币种查看开奖结果" />
            )}
          </Col>
        </Row>
      </Card>

      {/* Sessions table */}
      <Table
        loading={loading}
        dataSource={sessions}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 20 }}
      />

      {/* Recent trading orders */}
      <Card
        title="近期交易订单"
        style={{ marginTop: 24 }}
        extra={
          <Button icon={<ReloadOutlined />} size="small" onClick={fetchOrders}>
            刷新
          </Button>
        }
      >
        <Table
          loading={ordersLoading}
          dataSource={orders}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1200 }}
          columns={[
            { title: '订单ID', dataIndex: 'id', key: 'id', width: 80 },
            {
              title: '用户',
              key: 'user',
              width: 120,
              render: (_: any, record: TradingOrder) =>
                record.username ? `@${record.username}` : record.first_name || record.telegram_id || '-',
            },
            {
              title: '交易对',
              key: 'pair',
              width: 100,
              render: (_: any, record: TradingOrder) => record.display_name || record.symbol,
            },
            {
              title: '方向',
              dataIndex: 'direction',
              key: 'direction',
              width: 70,
              render: (d: string) => (
                <Tag color={d === 'up' ? 'green' : 'red'}>{d === 'up' ? '▲ 涨' : '▼ 跌'}</Tag>
              ),
            },
            {
              title: '金额',
              dataIndex: 'amount',
              key: 'amount',
              width: 90,
              render: (v: any) => `$${parseFloat(String(v ?? 0)).toFixed(2)}`,
            },
            {
              title: '赔率',
              dataIndex: 'odds',
              key: 'odds',
              width: 70,
              render: (v: any) => parseFloat(String(v ?? 0)).toFixed(2),
            },
            {
              title: '入场价',
              dataIndex: 'entry_price',
              key: 'entry_price',
              width: 110,
              render: (v: any) => v ? `$${parseFloat(String(v)).toFixed(4)}` : '-',
            },
            {
              title: '结算价',
              dataIndex: 'settlement_price',
              key: 'settlement_price',
              width: 110,
              render: (v: any) => v ? `$${parseFloat(String(v)).toFixed(4)}` : '-',
            },
            {
              title: '结果',
              dataIndex: 'result',
              key: 'result',
              width: 80,
              render: (r: string, record: TradingOrder) => {
                if (record.status === 'active' || record.status === 'pending') {
                  return <Tag color="blue">进行中</Tag>;
                }
                if (!r) return <Tag color="default">{record.status}</Tag>;
                return <Tag color={r === 'win' ? 'green' : 'red'}>{r === 'win' ? '赢' : '输'}</Tag>;
              },
            },
            {
              title: '期号',
              dataIndex: 'period_label',
              key: 'period_label',
              width: 120,
              render: (v: string) => v || '-',
            },
            {
              title: '下单时间',
              dataIndex: 'created_at',
              key: 'created_at',
              width: 160,
              render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
            },
          ]}
        />
      </Card>

      <Modal
        title="结算交易时段"
        open={settleModalVisible}
        onCancel={() => setSettleModalVisible(false)}
        footer={null}
        width={500}
      >
        {selectedSession && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="时段ID">{selectedSession.id}</Descriptions.Item>
              <Descriptions.Item label="交易对">
                {selectedSession.pair_display_name || selectedSession.pair_symbol}
              </Descriptions.Item>
              <Descriptions.Item label="开仓价格">
                ${parseFloat(selectedSession.entry_price || 0).toFixed(2)}
              </Descriptions.Item>
              {selectedSession.rule_name && (
                <Descriptions.Item label="规则">
                  {selectedSession.rule_name}（{selectedSession.rule_direction === 'up' ? '涨' : '跌'}）
                </Descriptions.Item>
              )}
            </Descriptions>

            <Form form={form} layout="vertical" onFinish={handleSettleSubmit}>
              <Form.Item
                name="result_direction"
                label="结果方向"
                rules={[{ required: true, message: '请选择结果方向' }]}
              >
                <Select placeholder="选择结果方向">
                  <Option value="up">涨（绿）</Option>
                  <Option value="down">跌（红）</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="settlement_price"
                label="结算价格"
                rules={[{ required: true, message: '请输入结算价格' }]}
              >
                <InputNumber
                  min={0}
                  step={0.01}
                  precision={8}
                  style={{ width: '100%' }}
                  placeholder="例如：65432.10"
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    立即结算
                  </Button>
                  <Button onClick={() => setSettleModalVisible(false)}>取消</Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        title="时段详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedSession && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="时段ID">{selectedSession.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={selectedSession.status === 'settled' ? 'green' : 'blue'}>
                {selectedSession.status === 'settled' ? '已结算' : selectedSession.status === 'active' ? '进行中' : selectedSession.status?.toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="交易对" span={2}>
              {selectedSession.pair_display_name || selectedSession.pair_symbol}
            </Descriptions.Item>
            {selectedSession.period_label && (
              <Descriptions.Item label="期号" span={2}>
                {selectedSession.period_label}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="开仓价格">
              ${parseFloat(selectedSession.entry_price || 0).toFixed(8)}
            </Descriptions.Item>
            <Descriptions.Item label="结算价格">
              {selectedSession.settlement_price
                ? `$${parseFloat(selectedSession.settlement_price).toFixed(8)}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="开始时间" span={2}>
              {dayjs(selectedSession.start_time).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="结束时间" span={2}>
              {dayjs(selectedSession.end_time).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            {selectedSession.settled_at && (
              <Descriptions.Item label="结算时间" span={2}>
                {dayjs(selectedSession.settled_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            )}
            {selectedSession.rule_name && (
              <>
                <Descriptions.Item label="规则名称">{selectedSession.rule_name}</Descriptions.Item>
                <Descriptions.Item label="规则方向">
                  <Tag color={selectedSession.rule_direction === 'up' ? 'green' : 'red'}>
                    {selectedSession.rule_direction === 'up' ? '涨' : '跌'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="赔率">
                  {selectedSession.rule_odds ? parseFloat(selectedSession.rule_odds).toFixed(2) : '-'}
                </Descriptions.Item>
              </>
            )}
            {selectedSession.result_direction && (
              <Descriptions.Item label="实际结果">
                <Tag color={selectedSession.result_direction === 'up' ? 'green' : 'red'}>
                  {selectedSession.result_direction === 'up' ? '涨' : '跌'}
                </Tag>
              </Descriptions.Item>
            )}
            {selectedSession.total_bet_amount && (
              <>
                <Descriptions.Item label="总下注金额">
                  ${parseFloat(selectedSession.total_bet_amount).toFixed(2)}
                </Descriptions.Item>
                <Descriptions.Item label="总派奖金额">
                  ${parseFloat(selectedSession.total_payout || 0).toFixed(2)}
                </Descriptions.Item>
                <Descriptions.Item label="平台利润" span={2}>
                  <span style={{
                    color: (parseFloat(selectedSession.total_bet_amount) - parseFloat(selectedSession.total_payout || 0)) >= 0
                      ? 'green'
                      : 'red'
                  }}>
                    ${(parseFloat(selectedSession.total_bet_amount) - parseFloat(selectedSession.total_payout || 0)).toFixed(2)}
                  </span>
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
