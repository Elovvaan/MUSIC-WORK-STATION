"use client";
import { useAppStore } from "@/lib/state/app-store";

export function TopTransport() {
  const transport = useAppStore((s) => s.transport);
  const setTransport = useAppStore((s) => s.setTransport);

  return (
    <header className="topbar">
      <div className="control-row">
        <button onClick={() => setTransport({ isPlaying: !transport.isPlaying })}>{transport.isPlaying ? "Stop" : "Play"}</button>
        <button onClick={() => setTransport({ isRecording: !transport.isRecording })}>{transport.isRecording ? "Stop Rec" : "Record"}</button>
        <button onClick={() => setTransport({ loopEnabled: !transport.loopEnabled })}>Loop: {transport.loopEnabled ? "On" : "Off"}</button>
      </div>
      <div className="control-row">
        <label>BPM <input type="number" value={transport.bpm} onChange={(e) => setTransport({ bpm: Number(e.target.value) })} /></label>
        <label><input type="checkbox" checked={transport.metronomeEnabled} onChange={(e) => setTransport({ metronomeEnabled: e.target.checked })} /> Metronome</label>
        <select value={transport.countInBars} onChange={(e) => setTransport({ countInBars: Number(e.target.value) as 0|1|2 })}><option value={0}>0-bar</option><option value={1}>1-bar</option><option value={2}>2-bar</option></select>
      </div>
    </header>
  );
}
