import { useCallback, useEffect, type MutableRefObject } from "react";
import Terminal, { type TermHandle } from "./Terminal";
import { usePtySocket, type PtySocket } from "../hooks/usePtySocket";

type Mods = { ctrl: boolean; alt: boolean };

type Props = {
  sid: string;
  active: boolean;
  modifiersRef: MutableRefObject<Mods>;
  onConsumeModifiers: () => void;
  register: (sid: string, pty: PtySocket | null) => void;
  registerTerm: (sid: string, handle: TermHandle | null) => void;
};

// One mounted terminal per tab. All tabs stay mounted (so their sessions keep
// running); only the active one is visible.
export default function TerminalTab({ sid, active, modifiersRef, onConsumeModifiers, register, registerTerm }: Props) {
  const pty = usePtySocket(sid);

  useEffect(() => {
    register(sid, pty);
    return () => register(sid, null);
  }, [sid, pty, register]);

  const onTerm = useCallback((h: TermHandle | null) => registerTerm(sid, h), [sid, registerTerm]);

  return (
    <div style={{ flex: 1, display: active ? "flex" : "none", overflow: "hidden", minHeight: 0 }}>
      <Terminal ptySocket={pty} modifiersRef={modifiersRef} onConsumeModifiers={onConsumeModifiers} onTerm={onTerm} />
    </div>
  );
}
