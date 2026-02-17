import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Tag, Space, DatePicker, Progress, Select } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';
import dayjs from 'dayjs';

interface CharityProject {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  goal_amount: number;
  current_amount: number;
  organization?: string;
  status: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
}

export const CharityProjects: React.FC = () => {
  const [projects, setProjects] = useState<CharityProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<CharityProject | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getCharityProjects();
      setProjects(response.projects || []);
    } catch (error) {
      console.error('Failed to fetch charity projects:', error);
      message.error('获取公益项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (project?: CharityProject) => {
    if (project) {
      setEditingProject(project);
      const formValues = {
        ...project,
        start_date: project.start_date ? dayjs(project.start_date) : undefined,
        end_date: project.end_date ? dayjs(project.end_date) : undefined,
      };
      form.setFieldsValue(formValues);
    } else {
      setEditingProject(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Convert dates to ISO strings if present
      if (values.start_date) {
        values.start_date = values.start_date.toISOString();
      }
      if (values.end_date) {
        values.end_date = values.end_date.toISOString();
      }
      
      if (editingProject) {
        await apiClient.updateCharityProject(editingProject.id, values);
        message.success('项目更新成功');
      } else {
        await apiClient.createCharityProject(values);
        message.success('项目创建成功');
      }
      
      setModalOpen(false);
      form.resetFields();
      setEditingProject(null);
      fetchProjects();
    } catch (error: any) {
      console.error('Failed to save project:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await apiClient.updateCharityProject(id, { status });
      message.success('状态更新成功');
      fetchProjects();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      message.error(error.response?.data?.error || '更新失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '封面',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 80,
      render: (url: string) => url ? (
        <img src={url} alt="cover" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
      ) : '-',
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
    },
    {
      title: '组织',
      dataIndex: 'organization',
      key: 'organization',
      width: 150,
    },
    {
      title: '目标金额',
      dataIndex: 'goal_amount',
      key: 'goal_amount',
      width: 120,
      render: (amount: number) => `${amount.toFixed(2)} USDT`,
    },
    {
      title: '已筹金额',
      dataIndex: 'current_amount',
      key: 'current_amount',
      width: 120,
      render: (amount: number) => (
        <span style={{ fontWeight: 'bold', color: '#52c41a' }}>
          {amount.toFixed(2)} USDT
        </span>
      ),
    },
    {
      title: '进度',
      key: 'progress',
      width: 150,
      render: (_: any, record: CharityProject) => {
        const percent = record.goal_amount > 0 
          ? Math.min((record.current_amount / record.goal_amount) * 100, 100)
          : 0;
        return (
          <Progress 
            percent={Number(percent.toFixed(1))} 
            size="small" 
            status={percent >= 100 ? 'success' : 'active'}
          />
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '进行中', color: 'green' },
          completed: { text: '已完成', color: 'blue' },
          closed: { text: '已关闭', color: 'red' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '结束时间',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: any, record: CharityProject) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          {record.status === 'active' && (
            <>
              <Button
                type="link"
                size="small"
                onClick={() => handleUpdateStatus(record.id, 'completed')}
              >
                完成
              </Button>
              <Button
                type="link"
                size="small"
                danger
                onClick={() => handleUpdateStatus(record.id, 'closed')}
              >
                关闭
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>公益项目管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和管理公益援助项目</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          创建项目
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={projects}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1400 }}
      />

      <Modal
        title={editingProject ? '编辑项目' : '创建项目'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setEditingProject(null);
        }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: 'active' }}
        >
          <Form.Item
            name="title"
            label="项目标题"
            rules={[{ required: true, message: '请输入项目标题' }]}
          >
            <Input placeholder="例如：乡村教育援助计划" />
          </Form.Item>

          <Form.Item
            name="description"
            label="项目描述"
          >
            <Input.TextArea rows={4} placeholder="详细描述项目内容和目标" />
          </Form.Item>

          <Form.Item
            name="image_url"
            label="封面图 URL"
          >
            <Input placeholder="https://example.com/image.png" />
          </Form.Item>

          <Form.Item
            name="organization"
            label="组织机构"
          >
            <Input placeholder="发起组织名称" />
          </Form.Item>

          <Form.Item
            name="goal_amount"
            label="目标金额 (USDT)"
            rules={[{ required: true, message: '请输入目标金额' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="start_date"
            label="开始时间"
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="end_date"
            label="结束时间"
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select>
              <Select.Option value="active">进行中</Select.Option>
              <Select.Option value="completed">已完成</Select.Option>
              <Select.Option value="closed">已关闭</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
