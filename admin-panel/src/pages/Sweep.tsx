import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Select,
  Tag,
  Space,
  message,
  Typography,
  Row,
  Col,
} from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { Title } = Typography;

interface SweepRecord {
  id: string;
  network_id: number;
  from_address: string;
  to_address: string;
  amount: string;
  tx_hash: string | null;
  status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  error_message: string | null;
  created_at: string;
}

interface DepositNetwork {
  id: number;
  network_name: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'blue',
  broadcast: 'orange',
  confirmed: 'green',
  failed: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  broadcast: '已广播',
  confirmed: '已确认',
  failed: '失败',
};

function truncate(str: string, n = 12): string {
  if (!str || str.length <= n * 2 + 3) return str;
  return `${str.slice(0, n)}...${str.slice(-n)}`;
}

export const Sweep: React.FC = () => {
  const [records, setRecords] = useState<SweepRecord[]>([]);
  const [networks, setNetworks] = useState<DepositNetwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterNetworkId, setFilterNetworkId] = useState<string | undefined>(undefined);

  // Load available deposit networks for the filter dropdown
  useEffect(() => {
    apiClient
      .get('/admin/wallet/networks')
      .then((res) => {
        setNetworks(res.data?.networks || []);
      })
      .catch((err) => {
        console.warn('Failed to load networks for filter:', err);
      });
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit: pageSize };
      if (filterStatus) params.status = filterStatus;
      if (filterNetworkId) params.networkId = filterNetworkId;

      const response = await apiClient.get('/admin/sweep/history', params);
      setRecords(response.data?.records || []);
      setTotal(response.data?.total || 0);
    } catch (error) {
      console.error('Failed to fetch sweep history:', error);
      message.error('获取归集记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterNetworkId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchHistory();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchHistory]);

  const handleRunSweep = async () => {
    setSweeping(true);
    try {
      const response = await apiClient.post('/admin/sweep/run', {});
      const results = response.data?.results || [];
      const broadcast = results.filter((r: any) => r.status === 'broadcast').length;
      const failed = results.filter((r: any) => r.status === 'failed').length;

      if (broadcast > 0) {
        message.success(`归集完成：${broadcast} 笔已广播${failed > 0 ? `，${failed} 笔失败` : ''}`);
      } else if (failed > 0) {
        message.error(`归集失败：${failed} 笔出错`);
      } else {
        message.info('归集完成：无需归集的地址');
      }

      fetchHistory();
    } catch (error: any) {
      console.error('Sweep run failed:', error);
      message.error(error.response?.data?.error || '归集失败，请重试');
    } finally {
      setSweeping(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => id?.substring(0, 8) || '-',
    },
    {
      title: '网络',
      dataIndex: 'network_id',
      key: 'network_id',
      width: 80,
    },
    {
      title: '来源地址',
      dataIndex: 'from_address',
      key: 'from_address',
      ellipsis: true,
      render: (addr: string) => (
        <span title={addr} style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {truncate(addr)}
        </span>
      ),
    },
    {
      title: '目标地址',
      dataIndex: 'to_address',
      key: 'to_address',
      ellipsis: true,
      render: (addr: string) => (
        <span title={addr} style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {truncate(addr)}
        </span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amt: string) => parseFloat(amt).toFixed(4),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] || 'default'}>
          {STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'TX Hash',
      dataIndex: 'tx_hash',
      key: 'tx_hash',
      ellipsis: true,
      render: (hash: string | null) =>
        hash ? (
          <span title={hash} style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {truncate(hash, 10)}
          </span>
        ) : (
          <span style={{ color: '#ccc' }}>-</span>
        ),
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          归集管理
        </Title>
        <Button
          type="primary"
          icon={<SyncOutlined spin={sweeping} />}
          loading={sweeping}
          onClick={handleRunSweep}
        >
          立即归集
        </Button>
      </div>

      {/* Filter bar */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="选择网络"
            allowClear
            style={{ width: 160 }}
            value={filterNetworkId}
            onChange={(v) => {
              setFilterNetworkId(v);
              setPage(1);
            }}
          >
            {networks.map((n) => (
              <Select.Option key={n.id} value={String(n.id)}>
                {n.network_name}
              </Select.Option>
            ))}
          </Select>
        </Col>
        <Col>
          <Select
            placeholder="选择状态"
            allowClear
            style={{ width: 140 }}
            value={filterStatus}
            onChange={(v) => {
              setFilterStatus(v);
              setPage(1);
            }}
          >
            <Select.Option value="pending">待处理</Select.Option>
            <Select.Option value="broadcast">已广播</Select.Option>
            <Select.Option value="confirmed">已确认</Select.Option>
            <Select.Option value="failed">失败</Select.Option>
          </Select>
        </Col>
        <Col>
          <Space>
            <Button onClick={fetchHistory} icon={<SyncOutlined />}>
              刷新
            </Button>
          </Space>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p) => setPage(p),
          showTotal: (t) => `共 ${t} 条`,
        }}
        scroll={{ x: 900 }}
      />
    </div>
  );
};
