import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Button,
  message,
  Tag,
  Space,
  Card,
  Row,
  Col,
  Spin,
  Empty,
  Avatar,
  Tabs,
} from 'antd';
import { ReloadOutlined, LeftOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const DURATION_LABELS: Record<number, string> = {
  60: '1 Min',
  300: '5 Min',
  600: '10 Min',
};

const DURATIONS = [60, 300, 600];

const POSITIVE_COLOR = '#52c41a';
const NEGATIVE_COLOR = '#f5222d';

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
  price_change_24h?: number | null;
  open_price?: string | null;
  is_active?: boolean;
  change_24h?: number | null;
}

// ─── CoinGridView ─────────────────────────────────────────────────────────────

interface CoinGridViewProps {
  pairs: TradingPair[];
  openPriceMap: Record<string, string | null>;
  pairsWithPrice: PairWithOpenPrice[];
  pairsLoading: boolean;
  selectedPairId: string | null;
  onSelect: (pairId: string) => void;
  onRefresh: () => void;
}

const CoinGridView: React.FC<CoinGridViewProps> = ({
  pairs,
  openPriceMap,
  pairsWithPrice,
  pairsLoading,
  selectedPairId,
  onSelect,
  onRefresh,
}) => {
  const priceIndex = useMemo(() => {
    const index: Record<string, PairWithOpenPrice> = {};
    pairsWithPrice.forEach((p) => { index[p.id] = p; });
    return index;
  }, [pairsWithPrice]);

  return (
    <Card
      title="选择币种查看开奖结果"
      style={{ marginBottom: 24 }}
      extra={
        <Button icon={<ReloadOutlined />} size="small" onClick={onRefresh}>
          刷新
        </Button>
      }
    >
      <Spin spinning={pairsLoading}>
        {pairs.length === 0 && !pairsLoading ? (
          <Empty description="暂无非自定义币种" />
        ) : (
          <Row gutter={[16, 16]}>
            {pairs.map((pair) => {
              const label = pair.display_name || pair.symbol;
              const initials = (pair.symbol || '?').slice(0, 2).toUpperCase();
              const isSelected = selectedPairId === pair.id;
              const priceInfo = priceIndex[pair.id];
              const currentPrice = priceInfo?.current_price != null ? Number(priceInfo.current_price) : null;
              const openPrice = openPriceMap[pair.id];
              const change24h = priceInfo?.change_24h != null ? Number(priceInfo.change_24h) : null;
              const changeColor = change24h == null ? '#888' : change24h >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR;
              const changePrefix = change24h != null && change24h >= 0 ? '+' : '';

              return (
                <Col key={pair.id} xs={12} sm={8} md={6} lg={4}>
                  <Card
                    hoverable
                    onClick={() => onSelect(pair.id)}
                    bodyStyle={{ padding: '12px 10px', textAlign: 'center' }}
                    style={{
                      border: isSelected ? '2px solid #1677ff' : '2px solid #f0f0f0',
                      background: isSelected ? '#e6f4ff' : '#fff',
                      transition: 'all 0.15s',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      {pair.icon_url ? (
                        <Avatar src={pair.icon_url} size={40} />
                      ) : (
                        <Avatar size={40} style={{ backgroundColor: '#1677ff', fontSize: 14 }}>
                          {initials}
                        </Avatar>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 13, color: '#1677ff', marginBottom: 2, fontWeight: 600 }}>
                      {currentPrice != null
                        ? `$${currentPrice.toFixed(4)}`
                        : openPrice != null
                          ? `$${parseFloat(openPrice).toFixed(4)}`
                          : '-'}
                    </div>
                    <div style={{ fontSize: 12, color: changeColor }}>
                      {change24h == null
                        ? '-'
                        : `${changePrefix}${change24h.toFixed(2)}%`}
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>
    </Card>
  );
};

// ─── CoinDetailView ───────────────────────────────────────────────────────────

interface CoinDetailViewProps {
  pair: TradingPair;
  openPrice: string | null | undefined;
  currentPrice: number | undefined;
  todayResults: TodayResult[];
  loading: boolean;
  onBack: () => void;
}

const CoinDetailView: React.FC<CoinDetailViewProps> = ({
  pair,
  openPrice,
  currentPrice,
  todayResults,
  loading,
  onBack,
}) => {
  const label = pair.display_name || pair.symbol;
  const initials = (pair.symbol || '?').slice(0, 2).toUpperCase();

  const tableColumns = [
    {
      title: '期号',
      key: 'label',
      width: 130,
      render: (_value: unknown, s: TodayResult) => {
        if (s.period_label) return s.period_label;
        return dayjs(s.start_time).format('YYYYMMDD-HHmm');
      },
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      key: 'end_time',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '开盘价',
      dataIndex: 'open_price',
      key: 'open_price',
      width: 130,
      render: (v: string) => (v ? `$${parseFloat(v).toFixed(4)}` : '-'),
    },
    {
      title: '结算价',
      dataIndex: 'settlement_price',
      key: 'settlement_price',
      width: 130,
      render: (v: string) => (v ? `$${parseFloat(v).toFixed(4)}` : '-'),
    },
    {
      title: '结果',
      dataIndex: 'result_direction',
      key: 'result_direction',
      width: 90,
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
      render: (v: string) => <Tag color="green">{v || 0} 人</Tag>,
    },
    {
      title: '买跌人数',
      dataIndex: 'down_count',
      key: 'down_count',
      width: 90,
      render: (v: string) => <Tag color="red">{v || 0} 人</Tag>,
    },
  ];

  const tabItems = DURATIONS.map((dur) => {
    const filtered = todayResults.filter((s) => Number(s.duration_seconds) === dur);
    return {
      key: String(dur),
      label: DURATION_LABELS[dur] || `${dur}s`,
      children: (
        <Table
          dataSource={filtered}
          columns={tableColumns}
          rowKey="id"
          size="small"
          scroll={{ x: 800 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="暂无结算数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      ),
    };
  });

  return (
    <Card
      style={{ marginBottom: 24 }}
      bodyStyle={{ paddingTop: 12 }}
    >
      {/* Back button */}
      <div style={{ marginBottom: 12 }}>
        <Button type="link" icon={<LeftOutlined />} onClick={onBack} style={{ paddingLeft: 0 }}>
          返回币种列表
        </Button>
      </div>

      {/* Coin header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Space size={12} align="center">
          {pair.icon_url ? (
            <Avatar src={pair.icon_url} size={48} />
          ) : (
            <Avatar size={48} style={{ backgroundColor: '#1677ff', fontSize: 18 }}>
              {initials}
            </Avatar>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#888' }}>{pair.symbol}</div>
          </div>
        </Space>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: POSITIVE_COLOR, lineHeight: 1.2 }}>
            {currentPrice != null
              ? `$${currentPrice.toFixed(4)}`
              : openPrice != null
                ? `$${parseFloat(openPrice).toFixed(4)}`
                : '-'}
          </div>
          {openPrice != null && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              今日 UTC 0 点开盘价: ${parseFloat(openPrice).toFixed(4)}
            </div>
          )}
        </div>
      </div>

      {/* Duration tabs */}
      <Spin spinning={loading}>
        <Tabs items={tabItems} defaultActiveKey="60" />
      </Spin>
    </Card>
  );
};

export const TradingSessions: React.FC = () => {
  // Two-level view state
  const [view, setView] = useState<'grid' | 'detail'>('grid');

  // Coin list + today's results
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [pairsWithPrice, setPairsWithPrice] = useState<PairWithOpenPrice[]>([]);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [todayResults, setTodayResults] = useState<TodayResult[]>([]);
  const [todayResultsLoading, setTodayResultsLoading] = useState(false);
  const [openPriceMap, setOpenPriceMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    fetchPairs();
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
        const rawData: PairWithOpenPrice[] = openPriceRes.value.data || openPriceRes.value || [];
        const opData: PairWithOpenPrice[] = rawData.map((p) => ({
          ...p,
          current_price: p.current_price != null ? Number(p.current_price) : undefined,
          price_change_24h: p.price_change_24h != null ? Number(p.price_change_24h) : null,
          change_24h: p.price_change_24h != null ? Number(p.price_change_24h) : null,
        }));
        const map: Record<string, string | null> = {};
        opData.forEach((p) => { map[p.id] = p.open_price ?? null; });
        setOpenPriceMap(map);
        setPairsWithPrice(opData);
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

  const handleSelectPair = (pairId: string) => {
    setSelectedPairId(pairId);
    setView('detail');
    fetchTodayResults(pairId);
  };

  const handleBackToGrid = () => {
    setView('grid');
  };

  const selectedPair = pairs.find((p) => p.id === selectedPairId);
  const selectedPairPrice = pairsWithPrice.find((p) => p.id === selectedPairId);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>交易结算管理 (Trading Sessions)</h2>
      </div>

      {/* Two-level coin selector / today's results */}
      {view === 'grid' ? (
        <CoinGridView
          pairs={pairs}
          openPriceMap={openPriceMap}
          pairsWithPrice={pairsWithPrice}
          pairsLoading={pairsLoading}
          selectedPairId={selectedPairId}
          onSelect={handleSelectPair}
          onRefresh={fetchPairs}
        />
      ) : selectedPair ? (
        <CoinDetailView
          pair={selectedPair}
          openPrice={openPriceMap[selectedPair.id]}
          currentPrice={selectedPairPrice?.current_price}
          todayResults={todayResults}
          loading={todayResultsLoading}
          onBack={handleBackToGrid}
        />
      ) : null}
    </div>
  );
};
