import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Bot,
  CheckCircle,
  Gift,
  Radio,
  Image,
  Building2,
  BookOpen,
  Wallet,
  Settings,
} from 'lucide-react';

const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { path: '/users', icon: Users, label: '用户管理' },
  { path: '/bots', icon: Bot, label: 'Bot 管理' },
  { path: '/bindings', icon: CheckCircle, label: '绑定审核' },
  { path: '/red-packets', icon: Gift, label: '红包管理' },
  { path: '/broadcasts', icon: Radio, label: '广播通知' },
  { path: '/screenshots', icon: Image, label: '截图审核' },
  { path: '/exchanges', icon: Building2, label: '交易所管理' },
  { path: '/tutorials', icon: BookOpen, label: '教程管理' },
  { path: '/withdrawals', icon: Wallet, label: '提现管理' },
  { path: '/settings', icon: Settings, label: '系统设置' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 gradient-purple text-white min-h-screen">
      <div className="p-6">
        <h1 className="text-2xl font-bold">管理后台</h1>
        <p className="text-sm text-purple-200 mt-1">Telegram Growth Platform</p>
      </div>

      <nav className="mt-6">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 transition-colors ${
                isActive
                  ? 'bg-white bg-opacity-20 border-r-4 border-white'
                  : 'hover:bg-white hover:bg-opacity-10'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
