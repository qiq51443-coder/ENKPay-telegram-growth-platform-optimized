import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Space,
  Select,
  DatePicker,
  Button,
  Tag,
  Typography,
  message,
  Descriptions,
  Drawer,
} from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface AuditLog {
  id: string;
  admin_user_id?: string;
  admin_username?: string;
  admin_full_name?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });
  const [filters, setFilters] = useState({
    action: undefined as string | undefined,
    resource_type: undefined as string | undefined,
    start_date: undefined as string | undefined,
    end_date: undefined as string | undefined,
  });
  const [actions, setActions] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetchAuditLogs();
    fetchFilterOptions();
  }, [pagination.current, pagination.pageSize, filters]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAuditLogs({
        ...filters,
        page: pagination.current,
        per_page: pagination.pageSize,
      });

      setLogs(response.logs || []);
      setPagination({
        ...pagination,
        total: response.pagination?.total || 0,
      });
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error);
      if (error.response?.status !== 403) {
        message.error('获取审计日志失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [actionsRes, resourceTypesRes] = await Promise.all([
        apiClient.getAuditActions(),
        apiClient.getAuditResourceTypes(),
      ]);

      setActions(actionsRes.actions || []);
      setResourceTypes(resourceTypesRes.resource_types || []);
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters({
      ...filters,
      [key]: value,
    });
    setPagination({ ...pagination, current: 1 });
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setFilters({
        ...filters,
        start_date: dates[0].toISOString(),
        end_date: dates[1].toISOString(),
      });
    } else {
      setFilters({
        ...filters,
        start_date: undefined,
        end_date: undefined,
      });
    }
    setPagination({ ...pagination, current: 1 });
  };

  const handleReset = () => {
    setFilters({
      action: undefined,
      resource_type: undefined,
      start_date: undefined,
      end_date: undefined,
    });
    setPagination({ ...pagination, current: 1 });
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  const getActionTag = (action: string) => {
    const actionColors: Record<string, string> = {
      create_admin: 'green',
      update_admin: 'blue',
      delete_admin: 'red',
      create_bot: 'green',
      update_bot: 'blue',
      delete_bot: 'red',
      review_binding: 'orange',
      review_screenshot: 'orange',
      review_withdrawal: 'orange',
      login: 'cyan',
      logout: 'default',
    };

    return <Tag color={actionColors[action] || 'default'}>{action}</Tag>;
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '管理员',
      key: 'admin',
      width: 150,
      render: (_, record) => (
        <div>
          <div>{record.admin_username || '-'}</div>
          {record.admin_full_name && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.admin_full_name}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (action) => getActionTag(action),
    },
    {
      title: '资源类型',
      dataIndex: 'resource_type',
      key: 'resource_type',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '资源ID',
      dataIndex: 'resource_id',
      key: 'resource_id',
      width: 280,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h2>审计日志</h2>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="操作类型"
            style={{ width: 200 }}
            allowClear
            value={filters.action}
            onChange={(value) => handleFilterChange('action', value)}
          >
            {actions.map((action) => (
              <Select.Option key={action} value={action}>
                {action}
              </Select.Option>
            ))}
          </Select>

          <Select
            placeholder="资源类型"
            style={{ width: 150 }}
            allowClear
            value={filters.resource_type}
            onChange={(value) => handleFilterChange('resource_type', value)}
          >
            {resourceTypes.map((type) => (
              <Select.Option key={type} value={type}>
                {type}
              </Select.Option>
            ))}
          </Select>

          <RangePicker
            placeholder={['开始日期', '结束日期']}
            onChange={handleDateRangeChange}
            value={
              filters.start_date && filters.end_date
                ? [dayjs(filters.start_date), dayjs(filters.end_date)]
                : null
            }
          />

          <Button onClick={handleReset}>重置</Button>
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchAuditLogs}>
            刷新
          </Button>
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条日志`,
        }}
        onChange={handleTableChange}
      />

      <Drawer
        title="日志详情"
        placement="right"
        width={600}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedLog && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="时间">
              {new Date(selectedLog.created_at).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="管理员">
              {selectedLog.admin_username || '-'}
              {selectedLog.admin_full_name && ` (${selectedLog.admin_full_name})`}
            </Descriptions.Item>
            <Descriptions.Item label="操作">
              {getActionTag(selectedLog.action)}
            </Descriptions.Item>
            <Descriptions.Item label="资源类型">
              {selectedLog.resource_type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="资源ID">
              <Text copyable={!!selectedLog.resource_id}>
                {selectedLog.resource_id || '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="IP地址">
              {selectedLog.ip_address || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="User Agent">
              <Text style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                {selectedLog.user_agent || '-'}
              </Text>
            </Descriptions.Item>
            {selectedLog.details && (
              <Descriptions.Item label="详细信息">
                <pre
                  style={{
                    background: '#f5f5f5',
                    padding: '12px',
                    borderRadius: '4px',
                    maxHeight: '300px',
                    overflow: 'auto',
                    fontSize: '12px',
                  }}
                >
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default AuditLogs;
