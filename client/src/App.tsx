import { useState, useCallback } from "react";
import Layout from "./components/Layout";
import Terminal from "./components/Terminal";
import ChatPane from "./components/ChatPane";
import { usePtySocket } from "./hooks/usePtySocket";
import { useAgentSocket } from "./hooks/useAgentSocket";

const SESSION_ID = "dev-session";

export default function App() {
  const [activePane, setActivePane] = useState<"terminal" | "chat">("terminal");

  const pty = usePtySocket(SESSION_ID);
  const agent = useAgentSocket(SESSION_ID);

  const handleSendMessage = useCallback(
    (text: string) => {
      agent.send(text);
      setActivePane("chat");
    },
    [agent]
  );

  return (
    <Layout activePane={activePane} onPaneChange={setActivePane}>
      <Layout.Chat>
        <ChatPane messages={agent.messages} onSend={handleSendMessage} status={agent.status} />
      </Layout.Chat>
      <Layout.Terminal>
        <Terminal ptySocket={pty} />
      </Layout.Terminal>
    </Layout>
  );
}
