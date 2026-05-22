'use client';

import ChatPanel from '@/components/chat/ChatPanel';
import Navbar from '@/components/ui/Navbar';
import Sidebar from '@/components/ui/Sidebar';
import { useCharts } from '@/hooks/useCharts';
import { useQuery } from '@/hooks/useQuery';
import { ChartType } from '@/types';

export default function ChatPage() {
  const { sessions, activeSession, activeSessionId, messages, isLoading, sendPrompt, newChat, selectChat, deleteChat } = useQuery();
  const { saveChart } = useCharts();

  const handleSave = async (result: any, type: ChartType) => {
    await saveChart(result, type);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F]">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewChat={newChat}
          onSelectChat={selectChat}
          onDeleteChat={deleteChat}
        />
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          onSend={sendPrompt}
          onSaveChart={handleSave}
          onNewChat={newChat}
          activeSession={activeSession}
        />
      </div>
    </div>
  );
}