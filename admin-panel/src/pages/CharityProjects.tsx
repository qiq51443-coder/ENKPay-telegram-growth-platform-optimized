import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Tag, Space, DatePicker, Progress, Select, Switch, Upload } from 'antd';
import { PlusOutlined, EditOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { apiClient } from '../services/api';
import dayjs from 'dayjs';

interface CharityProject {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  goal_amount: number;
  raised_amount: number;
  organization?: string;
  status: string;
  start_date?: string;
  end_date?: string;
  ambassador_telegram?: string;
  is_active?: boolean;
  created_at: string;
}

export const CharityProjects: React.FC = () => {
  const [projects, setProjects] = useState<CharityProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<CharityProject | null>(null);
  const [form] = Form.useForm();
  const [imageFileList, setImageFileList] = useState<UploadFile[]>([]);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [banners, setBanners] = useState<any[]>([]);
  const [newBannerUrl, setNewBannerUrl] = useState('');
  const [newBannerTitle, setNewBannerTitle] = useState('');
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerFileList, setBannerFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getCharityProjects({ status: 'all' });
      setProjects(response.data || []);
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
      // Show existing image in upload list
      if (project.image_url) {
        setImageFileList([{
          uid: '-1',
          name: 'cover',
          status: 'done',
          url: project.image_url,
        }]);
      } else {
        setImageFileList([]);
      }
    } else {
      setEditingProject(null);
      form.resetFields();
      setImageFileList([]);
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

  const openBannerModal = async () => {
    setBannerLoading(true);
    setBannerModalOpen(true);
    try {
      const data = await apiClient.getCharityBanners();
      setBanners(data.data || []);
    } catch {
      setBanners([]);
    } finally {
      setBannerLoading(false);
    }
  };

  const handleAddBanner = async () => {
    // Use uploaded URL if available, otherwise fall back to manual URL input
    const uploadedUrl = bannerFileList.find(f => f.status === 'done')?.response?.url;
    const urlToUse = uploadedUrl || newBannerUrl.trim();
    if (!urlToUse) { message.error('请上传图片或输入图片URL'); return; }
    try {
      await apiClient.createCharityBanner({ image_url: urlToUse, title: newBannerTitle });
      message.success('轮播图添加成功');
      setNewBannerUrl('');
      setNewBannerTitle('');
      setBannerFileList([]);
      const data = await apiClient.getCharityBanners();
      setBanners(data.data || []);
    } catch {
      message.error('添加失败');
    }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      await apiClient.deleteCharityBanner(id);
      message.success('删除成功');
      setBanners(prev => prev.filter(b => b.id !== id));
    } catch {
      message.error('删除失败');
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
      render: (amount: number) => `${Number(amount).toFixed(2)} USDT`,
    },
    {
      title: '已筹金额',
      dataIndex: 'raised_amount',
      key: 'raised_amount',
      width: 120,
      render: (amount: number) => (
        <span style={{ fontWeight: 'bold', color: '#52c41a' }}>
          {Number(amount).toFixed(2)} USDT
        </span>
      ),
    },
    {
      title: '进度',
      key: 'progress',
      width: 150,
      render: (_: any, record: CharityProject) => {
        const ga = Number(record.goal_amount);
        const ra = Number(record.raised_amount);
        const percent = ga > 0
          ? Math.min((ra / ga) * 100, 100)
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
          cancelled: { text: '已取消', color: 'orange' },
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
                onClick={() => handleUpdateStatus(record.id, 'cancelled')}
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
        <Space>
          <Button icon={<PictureOutlined />} onClick={openBannerModal}>
            轮播图管理
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            创建项目
          </Button>
        </Space>
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

          <Form.Item label="封面图">
            <Upload
              name="file"
              action="/api/admin/upload"
              headers={{ Authorization: `Bearer ${localStorage.getItem('token') || ''}` }}
              listType="picture"
              fileList={imageFileList}
              maxCount={1}
              onChange={({ fileList, file }) => {
                setImageFileList(fileList);
                if (file.status === 'done' && file.response?.url) {
                  form.setFieldValue('image_url', file.response.url);
                  message.success('图片上传成功');
                } else if (file.status === 'error') {
                  message.error('图片上传失败');
                }
              }}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith('image/');
                if (!isImage) { message.error('只能上传图片文件'); return false; }
                const isLt10M = file.size / 1024 / 1024 < 10;
                if (!isLt10M) { message.error('图片大小不能超过10MB'); return false; }
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>点击上传封面图（支持GIF动图）</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="image_url" label="或直接输入封面图URL">
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
              <Select.Option value="cancelled">已取消</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="ambassador_telegram"
            label="公益大使 Telegram"
            tooltip={'填写不含@的用户名（如：myusername），迷你应用用户点击"联系公益大使"按钮将直接跳转到该用户的Telegram聊天'}
            extra="格式：不含@的用户名，例如 myusername"
          >
            <Input addonBefore="@" placeholder="例如：ambassador123" />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="是否进行中"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="进行中" unCheckedChildren="已停止" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Banner Management Modal */}
      <Modal
        title="轮播图管理"
        open={bannerModalOpen}
        onCancel={() => { setBannerModalOpen(false); setBannerFileList([]); setNewBannerUrl(''); setNewBannerTitle(''); }}
        footer={[<Button key="close" onClick={() => { setBannerModalOpen(false); setBannerFileList([]); setNewBannerUrl(''); setNewBannerTitle(''); }}>关闭</Button>]}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <h4>添加轮播图</h4>
          <div style={{ marginBottom: 8 }}>
            <Upload
              name="file"
              action="/api/admin/upload"
              headers={{ Authorization: `Bearer ${localStorage.getItem('token') || ''}` }}
              listType="picture"
              fileList={bannerFileList}
              maxCount={1}
              onChange={({ fileList, file }) => {
                setBannerFileList(fileList);
                if (file.status === 'done' && file.response?.url) {
                  message.success('图片上传成功');
                } else if (file.status === 'error') {
                  message.error('图片上传失败');
                }
              }}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith('image/');
                if (!isImage) { message.error('只能上传图片文件'); return false; }
                const isLt10M = file.size / 1024 / 1024 < 10;
                if (!isLt10M) { message.error('图片大小不能超过10MB'); return false; }
                return true;
              }}
            >
              <Button icon={<UploadOutlined />}>点击上传图片（支持GIF动图）</Button>
            </Upload>
          </div>
          <div style={{ marginBottom: 8, color: '#999', fontSize: 12 }}>或直接输入图片URL：</div>
          <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
            <Input
              placeholder="图片URL（可选，优先使用上传图片）"
              value={newBannerUrl}
              onChange={e => setNewBannerUrl(e.target.value)}
            />
            <Input
              placeholder="标题（可选）"
              value={newBannerTitle}
              onChange={e => setNewBannerTitle(e.target.value)}
            />
            <Button type="primary" onClick={handleAddBanner}>添加</Button>
          </Space.Compact>
        </div>
        {bannerLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>加载中...</div>
        ) : banners.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无轮播图</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {banners.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f0f0f0', padding: '8px', borderRadius: 6 }}>
                <img src={b.image_url} alt={b.title} style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 4 }} />
                <div style={{ flex: 1 }}>{b.title || '（无标题）'}</div>
                <Button danger size="small" onClick={() => handleDeleteBanner(b.id)}>删除</Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
