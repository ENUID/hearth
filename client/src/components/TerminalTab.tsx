import { useEffect, type MutableRefObject } from "react";
import Terminal from "./Terminal";
import { usePtySocket, type PtySocket } from "../hooks/usePtySocket";

type Mods = { ctrl: boolean; alt: boolean };

type Props = {
  sid: string;
  active: boolean;
  modifiersRef: MutableRefObject<Mods>;
  onConsumeModifiers: () => void;
  register: (sid: string, pty: PtySocket | null) => void;
};

// One mounted terminal per tab. All tabs stay mounted (so their sessions keep
// running); only the active one is visible.
export default function TerminalTab({ sid, active, modifiersRef, onConsumeModifiers, register }: Props) {
  const pty = usePtySocket(sid);

  useEffect(() => {
    register(sid, pty);
    return () => register(sid, null);
  }, [sid, pty, register]);

  return (
    <div style={{ flex: 1, display: active ? "flex" : "none", overflow: "hidden", minHeight: 0 }}>
      <Terminal ptySocket={pty} modifiersRef={modifiersRef} onConsumeModifiers={onConsumeModifiers} />
    </div>
  );
}
