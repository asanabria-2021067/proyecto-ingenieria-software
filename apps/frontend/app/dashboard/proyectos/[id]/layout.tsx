'use client';

import { useParams } from 'next/navigation';
import { ProjectSidebar } from '@/components/projects/project-sidebar';
import { ChatPanelProvider } from '@/components/projects/chat-panel-context';

export default function ProyectoLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  return (
    <ChatPanelProvider>
      <div className="flex h-[calc(100vh-4rem)] min-h-0">
        <ProjectSidebar idProyecto={idProyecto} />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </ChatPanelProvider>
  );
}
