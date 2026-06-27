import { ReactNode, createContext, useContext } from "react";

type Pane = "terminal" | "chat";

type LayoutProps = {
  children: ReactNode;
  activePane: Pane;
  onPaneChange: (p: Pane) => void;
};

type SlotProps = { children: ReactNode };

const LayoutContext = createContext<{ activePane: Pane }>({ activePane: "terminal" });

function Chat({ children }: SlotProps) {
  const { activePane } = useContext(LayoutContext);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "0 0 320px",
        borderRight: "1px solid var(--border)",
        overflow: "hidden",
        ...(window.innerWidth < 768 ? { display: activePane === "chat" ? "flex" : "none", flex: "1" } : {}),
      }}
    >
      {children}
    </div>
  );
}

function Terminal({ children }: SlotProps) {
  const { activePane } = useContext(LayoutContext);
  return (
    <div
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...(window.innerWidth < 768 ? { display: activePane === "terminal" ? "flex" : "none" } : {}),
      }}
    >
      {children}
    </div>
  );
}

export default function Layout({ children, activePane, onPaneChange }: LayoutProps) {
  const isMobile = window.innerWidth < 768;

  return (
    <LayoutContext.Provider value={{ activePane }}>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        {/* header */}
        <div
          style={{
            height: 40,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.02em", fontFamily: "var(--font-mono)" }}>
            hearth
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>dev-session</span>

          {isMobile && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {(["terminal", "chat"] as Pane[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onPaneChange(p)}
                  style={{
                    background: activePane === p ? "var(--accent-dim)" : "transparent",
                    color: activePane === p ? "var(--accent)" : "var(--text-muted)",
                    border: "1px solid " + (activePane === p ? "var(--accent-dim)" : "var(--border)"),
                    borderRadius: "var(--radius)",
                    padding: "2px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>{children}</div>
      </div>
    </LayoutContext.Provider>
  );
}

Layout.Chat = Chat;
Layout.Terminal = Terminal;
