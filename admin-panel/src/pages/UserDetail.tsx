import React from 'react';
import { Card } from 'antd';
import { useParams } from 'react-router-dom';

export const UserDetail: React.FC = () => {
  const { id } = useParams();
  
  return (
    <div>
      <h2>用户详情</h2>
      <Card>
        <p>用户 ID: {id}</p>
        <p>功能开发中...</p>
      </Card>
    </div>
  );
};
