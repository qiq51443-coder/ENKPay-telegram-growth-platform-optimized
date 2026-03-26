import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Select,
  DatePicker,
  Space,
  Tag,
  message,
  Input,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

export const TradingOrders: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState<{
    status?: string;
    pair_id?: string;
    start_date?: string;
    end_date?: string;
  }>({});

  const fetchOrders = useCallback(
    async (page = pagination.page, currentFilters = filters) => {
      setLoading(true);
      try {
        const params: any = { page, limit: pagination.limit, ...currentFilters };
        const response = await api.getTradingOrders(params);
        setOrders(response.data || []);
        if (response.pagination) {
          setPagination((prev) => ({
            ...prev,
            page: response.pagination.page,
            total: response.pagination.total,
          }));
        }
      } catch (error: any) {
        message.error(error.response?.data?.error || '获取交易订单失败');
      } finally {
        setLoading(false);
      }
    },
    [pagination.page, pagination.limit, filters]
  );

  useEffect(() => {
    fetchOrders(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    fetchOrders(1, newFilters);
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      const newFilters = {
        ...filters,
        start_date: dates[0].startOf('day').toISOString(),
        end_date: dates[1].endOf('day').toISOString(),
      };
      setFilters(newFilters);
      fetchOrders(1, newFilters);
    } else {
      const newFilters = { ...filters, start_date: undefined, end_date: undefined };
      setFilters(newFilters);
      fetchOrders(1, newFilters);
    }
  };

  const exportCSV = () => {
    if (orders.length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    const headers = [
      '订单ID', '用户ID', '用户名', 'TelegramID', '交易对', '方向',
      '金额', '入场价格', '结算价格', '赔率', '状态', '结果', '盈亏', '下单时间', '结算时间',
    ];
    const rows = orders.map((o) => [
      o.id, o.user_id, o.username || '', o.telegram_id || '',
      o.display_name || o.symbol || '',
      o.direction === 'up' ? '买涨' : '买跌',
      o.amount, o.entry_price || '', o.close_price || '',
      o.odds, o.status, o.result || '',
      o.profit || '',
      o.created_at ? dayjs(o.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
      o.settled_at ? dayjs(o.settled_at).format('YYYY-MM-DD HH:mm:ss') : '',
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading_orders_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: '订单ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (v: any) => <span style={{ fontSize: 12 }}>{String(v).length > 8 ? String(v).slice(0, 8) + '...' : String(v)}</span>,
    },
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.username || `User#${record.user_id}`}</div>
          <div style={{ fontSize: 11, color: '#999' }}>TG: {record.telegram_id}</div>
        </div>
      ),
    },
    {
      title: '交易对',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (v: any, record: any) => v || record.symbol || '-',
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      render: (v: string) => (
        <Tag color={v === 'up' ? 'green' : 'red'}>
          {v === 'up' ? '▲ 买涨' : '▼ 买跌'}
        </Tag>
      ),
    },
    {
      title: '金额 (USDT)',
      dataIndex: 'amount',
      key: 'amount',
      render: (v: any) => parseFloat(v).toFixed(2),
    },
    {
      title: '入场价',
      dataIndex: 'entry_price',
      key: 'entry_price',
      render: (v: any) => (v ? parseFloat(v).toFixed(4) : '-'),
    },
    {
      title: '结算价',
      dataIndex: 'close_price',
      key: 'close_price',
      render: (v: any) => (v ? parseFloat(v).toFixed(4) : '-'),
    },
    {
      title: '赔率',
      dataIndex: 'odds',
      key: 'odds',
      render: (v: any) => (v ? `${parseFloat(v).toFixed(2)}x` : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          active: 'processing',
          settled: 'success',
          expired: 'default',
          cancelled: 'error',
        };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      render: (v: string) => {
        if (!v) return '-';
        if (v === 'win') return <Tag color="green">赢 ✅</Tag>;
        if (v === 'draw') return <Tag color="gold">平局 ↩</Tag>;
        if (v === 'lose') return <Tag color="red">输 ❌</Tag>;
        return <Tag color="default">{v}</Tag>;
      },
    },
    {
      title: '盈亏 (USDT)',
      dataIndex: 'profit',
      key: 'profit',
      render: (v: any, record: any) => {
        if (v === null || v === undefined) return '-';
        const num = parseFloat(v);
        if (record.result === 'draw') {
          return <span style={{ color: '#f0b90b', fontWeight: 600 }}>↩ 退款</span>;
        }
        return (
          <span style={{ color: num > 0 ? '#26a69a' : num < 0 ? '#ef5350' : '#999', fontWeight: 600 }}>
            {num >= 0 ? '+' : ''}{num.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '下单时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '期号',
      dataIndex: 'period_label',
      key: 'period_label',
      render: (v: string) => v || '-',
    },
    {
      title: '结算时间',
      dataIndex: 'settled_at',
      key: 'settled_at',
      render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm:ss') : '-'),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>交易订单管理</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Select
            allowClear
            placeholder="状态筛选"
            style={{ width: 130 }}
            onChange={(v) => handleFilterChange('status', v)}
          >
            <Option value="active">进行中</Option>
            <Option value="settled">已结算</Option>
            <Option value="expired">已过期</Option>
            <Option value="cancelled">已取消</Option>
          </Select>
          <Input
            allowClear
            placeholder="交易对ID"
            style={{ width: 110 }}
            onPressEnter={(e: any) => handleFilterChange('pair_id', e.target.value)}
            onBlur={(e) => handleFilterChange('pair_id', e.target.value)}
          />
          <RangePicker
            onChange={handleDateRangeChange}
            style={{ width: 240 }}
            placeholder={['开始日期', '结束日期']}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchOrders(1, filters)}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportCSV}>
            导出 CSV
          </Button>
        </div>
      </div>
      <Table
        loading={loading}
        dataSource={orders}
        columns={columns}
        rowKey="id"
        size="small"
        scroll={{ x: 1200 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page) => {
            setPagination((prev) => ({ ...prev, page }));
            fetchOrders(page, filters);
          },
        }}
      />
    </div>
  );
};

export default TradingOrders;
