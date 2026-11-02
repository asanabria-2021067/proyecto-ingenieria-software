import { PageTransition } from '@/components/ui/page-transition';

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
