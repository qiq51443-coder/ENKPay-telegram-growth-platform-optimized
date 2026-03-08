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
      setSessions(response.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取交易时段失败');
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
      message.success('结算成功');
      setSettleModalVisible(false);
      
      // Show settlement result
      const result = response.data.data;
      Modal.info({
        title: '结算结果',
        content: (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="总订单数">{result.total_orders}</Descriptions.Item>
            <Descriptions.Item label="盈利订单">{result.winning_orders}</Descriptions.Item>
            <Descriptions.Item label="亏损订单">{result.losing_orders}</Descriptions.Item>
            <Descriptions.Item label="总下注金额">${result.total_bet_amount.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="总派奖金额">${result.total_payout.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="平台利润">
              <span style={{ color: result.platform_profit >= 0 ? 'green' : 'red' }}>
                ${result.platform_profit.toFixed(2)}
              </span>
            </Descriptions.Item>
          </Descriptions>
        ),
      });
      
      fetchSessions();
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
