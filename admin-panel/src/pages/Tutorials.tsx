import React from 'react';
import { Layout } from '../components/Layout/Layout';

export const Tutorials: React.FC = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">教程管理</h1>
          <p className="text-gray-600 mt-1">管理教程内容</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-gray-600">教程管理功能开发中...</p>
          <p className="text-sm text-gray-500 mt-2">
            可以在交易所管理中编辑每个交易所的教程内容
          </p>
        </div>
      </div>
    </Layout>
  );
};
