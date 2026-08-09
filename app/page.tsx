import { redirect } from 'next/navigation';

export default function Home() {
  // Phase 1 暂时跳转到管理后台，后续 Phase 2 再做前台时间轴
  redirect('/admin/login');
}