import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, Image as ImageIcon, X } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import apiClient from '../services/api';

interface TutorialCategory {
  id: string;
  name: string;
  name_en: string;
  name_zh: string;
  icon: string;
  order_index: number;
}

interface Exchange {
  id: string;
  name: string;
  name_zh: string;
}

interface TutorialImage {
  id?: string;
  image_url: string;
  caption?: string;
  caption_zh?: string;
  order_index: number;
}

interface TutorialStep {
  id?: string;
  step_number: number;
  title: string;
  title_zh?: string;
  description?: string;
  description_zh?: string;
  order_index: number;
  images: TutorialImage[];
}

interface Tutorial {
  id: string;
  exchange_id: string;
  exchange_name: string;
  category_id: string;
  category_name_en: string;
  category_name_zh: string;
  category_icon: string;
  title: string;
  title_zh?: string;
  description?: string;
  description_zh?: string;
  is_active: boolean;
  order_index: number;
  steps?: TutorialStep[];
}

export const Tutorials: React.FC = () => {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [categories, setCategories] = useState<TutorialCategory[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  
  const [formData, setFormData] = useState({
    exchange_id: '',
    category_id: '',
    title: '',
    title_zh: '',
    description: '',
    description_zh: '',
    is_active: true,
    order_index: 0,
  });

  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [currentStep, setCurrentStep] = useState<TutorialStep>({
    step_number: 1,
    title: '',
    title_zh: '',
    description: '',
    description_zh: '',
    order_index: 0,
    images: [],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tutorialsRes, categoriesRes, exchangesRes] = await Promise.all([
        apiClient.getTutorials(),
        apiClient.getTutorialCategories(),
        apiClient.getExchanges(),
      ]);
      setTutorials(tutorialsRes.tutorials || []);
      setCategories(categoriesRes.categories || []);
      setExchanges(exchangesRes.exchanges || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async (tutorial?: Tutorial) => {
    if (tutorial) {
      setEditingTutorial(tutorial);
      setFormData({
        exchange_id: tutorial.exchange_id,
        category_id: tutorial.category_id,
        title: tutorial.title,
        title_zh: tutorial.title_zh || '',
        description: tutorial.description || '',
        description_zh: tutorial.description_zh || '',
        is_active: tutorial.is_active,
        order_index: tutorial.order_index,
      });
      
      // Fetch full tutorial details with steps
      try {
        const response = await apiClient.getTutorial(tutorial.id);
        setSteps(response.tutorial.steps || []);
      } catch (error) {
        console.error('Failed to fetch tutorial details:', error);
        setSteps([]);
      }
    } else {
      setEditingTutorial(null);
      setFormData({
        exchange_id: '',
        category_id: '',
        title: '',
        title_zh: '',
        description: '',
        description_zh: '',
        is_active: true,
        order_index: 0,
      });
      setSteps([]);
    }
    setCurrentStep({
      step_number: 1,
      title: '',
      title_zh: '',
      description: '',
      description_zh: '',
      order_index: 0,
      images: [],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        steps: steps,
      };

      if (editingTutorial) {
        await apiClient.updateTutorial(editingTutorial.id, data);
        alert('教程更新成功');
      } else {
        await apiClient.createTutorial(data);
        alert('教程创建成功');
      }
      setModalOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Failed to save tutorial:', error);
      const errorMessage = error.response?.data?.error || '保存失败';
      alert(errorMessage);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个教程吗？')) return;
    try {
      await apiClient.deleteTutorial(id);
      alert('教程删除成功');
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete tutorial:', error);
      const errorMessage = error.response?.data?.error || '删除失败';
      alert(errorMessage);
    }
  };

  const addStep = () => {
    if (!currentStep.title) {
      alert('请输入步骤标题');
      return;
    }
    setSteps([...steps, { ...currentStep, step_number: steps.length + 1, order_index: steps.length }]);
    setCurrentStep({
      step_number: steps.length + 2,
      title: '',
      title_zh: '',
      description: '',
      description_zh: '',
      order_index: steps.length + 1,
      images: [],
    });
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    newSteps.forEach((step, i) => {
      step.step_number = i + 1;
      step.order_index = i;
    });
    setSteps(newSteps);
  };

  const addImageToCurrentStep = () => {
    const imageUrl = prompt('请输入图片 URL (或使用 Base64):');
    if (!imageUrl) return;
    
    const newImage: TutorialImage = {
      image_url: imageUrl,
      caption: '',
      caption_zh: '',
      order_index: currentStep.images.length,
    };
    setCurrentStep({
      ...currentStep,
      images: [...currentStep.images, newImage],
    });
  };

  const removeImageFromCurrentStep = (index: number) => {
    setCurrentStep({
      ...currentStep,
      images: currentStep.images.filter((_, i) => i !== index),
    });
  };

  const columns = [
    {
      key: 'exchange',
      title: '交易所',
      render: (tutorial: Tutorial) => tutorial.exchange_name || '-',
    },
    {
      key: 'category',
      title: '分类',
      render: (tutorial: Tutorial) => (
        <span>
          {tutorial.category_icon} {tutorial.category_name_zh || tutorial.category_name_en}
        </span>
      ),
    },
    {
      key: 'title',
      title: '标题',
      render: (tutorial: Tutorial) => tutorial.title,
    },
    {
      key: 'is_active',
      title: '状态',
      render: (tutorial: Tutorial) => (
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            tutorial.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {tutorial.is_active ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (tutorial: Tutorial) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2"
            onClick={() => handleOpenModal(tutorial)}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            variant="danger"
            className="text-xs py-1 px-2"
            onClick={() => handleDelete(tutorial.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">教程管理</h1>
            <p className="text-gray-600 mt-1">管理交易所使用教程</p>
          </div>
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus className="w-4 h-4 mr-2" />
            添加教程
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={tutorials} loading={loading} />
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingTutorial ? '编辑教程' : '添加教程'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSave}>
                保存
              </Button>
            </>
          }
        >
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">基本信息</h3>
              <Select
                label="交易所"
                value={formData.exchange_id}
                onChange={(e) => setFormData({ ...formData, exchange_id: e.target.value })}
                options={[
                  { value: '', label: '选择交易所' },
                  ...exchanges.map((ex) => ({ value: ex.id, label: ex.name })),
                ]}
                required
              />
              <Select
                label="分类"
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                options={[
                  { value: '', label: '选择分类' },
                  ...categories.map((cat) => ({ 
                    value: cat.id, 
                    label: `${cat.icon} ${cat.name_zh || cat.name_en}` 
                  })),
                ]}
                required
              />
              <Input
                label="标题 (英文)"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
              <Input
                label="标题 (中文)"
                value={formData.title_zh}
                onChange={(e) => setFormData({ ...formData, title_zh: e.target.value })}
              />
            </div>

            {/* Steps */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">教程步骤</h3>
              
              {/* Existing Steps */}
              {steps.length > 0 && (
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div key={index} className="border rounded p-3 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">
                            步骤 {step.step_number}: {step.title}
                          </div>
                          <div className="text-sm text-gray-600">
                            {step.images.length} 张图片
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="secondary"
                            className="text-xs py-1 px-2"
                            onClick={() => moveStep(index, 'up')}
                            disabled={index === 0}
                          >
                            <ChevronUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="secondary"
                            className="text-xs py-1 px-2"
                            onClick={() => moveStep(index, 'down')}
                            disabled={index === steps.length - 1}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="danger"
                            className="text-xs py-1 px-2"
                            onClick={() => removeStep(index)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Step */}
              <div className="border rounded p-4 space-y-3">
                <h4 className="font-medium">添加新步骤</h4>
                <Input
                  label="步骤标题 (英文)"
                  value={currentStep.title}
                  onChange={(e) => setCurrentStep({ ...currentStep, title: e.target.value })}
                  placeholder="例如: Verify your identity"
                />
                <Input
                  label="步骤标题 (中文)"
                  value={currentStep.title_zh}
                  onChange={(e) => setCurrentStep({ ...currentStep, title_zh: e.target.value })}
                  placeholder="例如: 验证您的身份"
                />
                <Input
                  label="描述 (英文)"
                  value={currentStep.description}
                  onChange={(e) => setCurrentStep({ ...currentStep, description: e.target.value })}
                  placeholder="详细说明..."
                />
                <Input
                  label="描述 (中文)"
                  value={currentStep.description_zh}
                  onChange={(e) => setCurrentStep({ ...currentStep, description_zh: e.target.value })}
                  placeholder="详细说明..."
                />
                
                {/* Images for current step */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    图片 ({currentStep.images.length})
                  </label>
                  <div className="space-y-2">
                    {currentStep.images.map((img, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-xs flex-1 truncate">{img.image_url.substring(0, 50)}...</span>
                        <Button
                          variant="danger"
                          className="text-xs py-1 px-2"
                          onClick={() => removeImageFromCurrentStep(idx)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      className="text-xs"
                      onClick={addImageToCurrentStep}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      添加图片
                    </Button>
                  </div>
                </div>

                <Button variant="primary" onClick={addStep} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  添加此步骤
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};
