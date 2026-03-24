export const APP_NAME = '轻卡新颜色开发项目管理系统';

export const APP_ROUTES = {
  home: '/',
  dashboard: '/dashboard',
  login: '/login',
  projects: '/projects',
  colors: '/colors',
  admin: '/admin',
  reviews: '/reviews',
  todos: '/todos',
  settings: '/settings',
} as const;

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
