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
} from 'antd';
import { ThunderboltOutlined, EyeOutlined } from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Option } = Select;

export const TradingSessions: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await api.getTradingSessions();
      setSessions(response.data.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to fetch trading sessions');
    } finally {
      setLoading(false);
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
      message.success('Session settled successfully');
      setSettleModalVisible(false);
      
      // Show settlement result
      const result = response.data.data;
      Modal.info({
        title: 'Settlement Result',
        content: (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Total Orders">{result.total_orders}</Descriptions.Item>
            <Descriptions.Item label="Winning Orders">{result.winning_orders}</Descriptions.Item>
            <Descriptions.Item label="Losing Orders">{result.losing_orders}</Descriptions.Item>
            <Descriptions.Item label="Total Bets">${result.total_bet_amount.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="Total Payout">${result.total_payout.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="Platform Profit">
              <span style={{ color: result.platform_profit >= 0 ? 'green' : 'red' }}>
                ${result.platform_profit.toFixed(2)}
              </span>
            </Descriptions.Item>
          </Descriptions>
        ),
      });
      
      fetchSessions();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to settle session');
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
      title: 'Trading Pair',
      dataIndex: 'pair_display_name',
      key: 'pair_display_name',
      render: (text: string, record: any) => text || record.pair_symbol,
    },
    {
      title: 'Start Time',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'End Time',
      dataIndex: 'end_time',
      key: 'end_time',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'blue',
          settled: 'green',
          expired: 'red',
        };
        return <Tag color={colorMap[status] || 'default'}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Rule',
      dataIndex: 'rule_name',
      key: 'rule_name',
      render: (text: string, record: any) => (
        text ? (
          <Space>
            <span>{text}</span>
            <Tag color={record.rule_direction === 'up' ? 'green' : 'red'}>
              {record.rule_direction?.toUpperCase()}
            </Tag>
          </Space>
        ) : '-'
      ),
    },
    {
      title: 'Result',
      dataIndex: 'result_direction',
      key: 'result_direction',
      render: (direction: string) => (
        direction ? (
          <Tag color={direction === 'up' ? 'green' : 'red'}>{direction.toUpperCase()}</Tag>
        ) : '-'
      ),
    },
    {
      title: 'Total Bets',
      dataIndex: 'total_bet_amount',
      key: 'total_bet_amount',
      render: (value: any) => value ? `$${parseFloat(value).toFixed(2)}` : '-',
    },
    {
      title: 'Total Payout',
      dataIndex: 'total_payout',
      key: 'total_payout',
      render: (value: any) => value ? `$${parseFloat(value).toFixed(2)}` : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            Details
          </Button>
          {record.status === 'active' && (
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => handleSettle(record)}
            >
              Settle
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>交易结算管理 (Trading Sessions)</h2>
      </div>

      <Table
        loading={loading}
        dataSource={sessions}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="Settle Trading Session"
        open={settleModalVisible}
        onCancel={() => setSettleModalVisible(false)}
        footer={null}
        width={500}
      >
        {selectedSession && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Session ID">{selectedSession.id}</Descriptions.Item>
              <Descriptions.Item label="Pair">
                {selectedSession.pair_display_name || selectedSession.pair_symbol}
              </Descriptions.Item>
              <Descriptions.Item label="Entry Price">
                ${parseFloat(selectedSession.entry_price || 0).toFixed(2)}
              </Descriptions.Item>
              {selectedSession.rule_name && (
                <Descriptions.Item label="Rule">
                  {selectedSession.rule_name} ({selectedSession.rule_direction?.toUpperCase()})
                </Descriptions.Item>
              )}
            </Descriptions>

            <Form form={form} layout="vertical" onFinish={handleSettleSubmit}>
              <Form.Item
                name="result_direction"
                label="Result Direction"
                rules={[{ required: true, message: 'Please select result direction' }]}
              >
                <Select placeholder="Select result direction">
                  <Option value="up">Up (绿涨)</Option>
                  <Option value="down">Down (红跌)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="settlement_price"
                label="Settlement Price"
                rules={[{ required: true, message: 'Please enter settlement price' }]}
              >
                <InputNumber
                  min={0}
                  step={0.01}
                  precision={8}
                  style={{ width: '100%' }}
                  placeholder="e.g., 65432.10"
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Settle Now
                  </Button>
                  <Button onClick={() => setSettleModalVisible(false)}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        title="Session Details"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedSession && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Session ID">{selectedSession.id}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={selectedSession.status === 'settled' ? 'green' : 'blue'}>
                {selectedSession.status?.toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Trading Pair" span={2}>
              {selectedSession.pair_display_name || selectedSession.pair_symbol}
            </Descriptions.Item>
            <Descriptions.Item label="Entry Price">
              ${parseFloat(selectedSession.entry_price || 0).toFixed(8)}
            </Descriptions.Item>
            <Descriptions.Item label="Settlement Price">
              {selectedSession.settlement_price 
                ? `$${parseFloat(selectedSession.settlement_price).toFixed(8)}` 
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Start Time" span={2}>
              {dayjs(selectedSession.start_time).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="End Time" span={2}>
              {dayjs(selectedSession.end_time).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            {selectedSession.settled_at && (
              <Descriptions.Item label="Settled At" span={2}>
                {dayjs(selectedSession.settled_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            )}
            {selectedSession.rule_name && (
              <>
                <Descriptions.Item label="Rule Name">{selectedSession.rule_name}</Descriptions.Item>
                <Descriptions.Item label="Rule Direction">
                  <Tag color={selectedSession.rule_direction === 'up' ? 'green' : 'red'}>
                    {selectedSession.rule_direction?.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Odds">
                  {selectedSession.rule_odds ? parseFloat(selectedSession.rule_odds).toFixed(2) : '-'}
                </Descriptions.Item>
              </>
            )}
            {selectedSession.result_direction && (
              <Descriptions.Item label="Actual Result">
                <Tag color={selectedSession.result_direction === 'up' ? 'green' : 'red'}>
                  {selectedSession.result_direction.toUpperCase()}
                </Tag>
              </Descriptions.Item>
            )}
            {selectedSession.total_bet_amount && (
              <>
                <Descriptions.Item label="Total Bets">
                  ${parseFloat(selectedSession.total_bet_amount).toFixed(2)}
                </Descriptions.Item>
                <Descriptions.Item label="Total Payout">
                  ${parseFloat(selectedSession.total_payout || 0).toFixed(2)}
                </Descriptions.Item>
                <Descriptions.Item label="Platform Profit" span={2}>
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
