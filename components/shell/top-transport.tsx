"use client";
import { samplerEngine } from "@/lib/audio/sampler-engine";
import { useAppStore } from "@/lib/state/app-store";

export function TopTransport() {
  const transport = useAppStore((s) => s.transport);
  const setTransport = useAppStore((s) => s.setTransport);

  function togglePlay() {
    if (transport.isPlaying) samplerEngine.allNotesOff();
    setTransport({ isPlaying: !transport.isPlaying });
  }

  function toggleRecord() {
    setTransport({ isRecording: !transport.isRecording, isPlaying: transport.isRecording ? transport.isPlaying : true });
  }

  return (
    <header className="topbar">
      <div className="control-row">
        <button onClick={togglePlay}>{transport.isPlaying ? "Stop" : "Play"}</button>
        <button onClick={toggleRecord}>{transport.isRecording ? "Stop Rec" : "Record"}</button>
        <button onClick={() => setTransport({ loopEnabled: !transport.loopEnabled })}>Loop: {transport.loopEnabled ? "On" : "Off"}</button>
        <button onClick={() => { samplerEngine.allNotesOff(); setTransport({ currentBeat: 0 }); }}>Return</button>
        <span>Beat {transport.currentBeat.toFixed(2)}</span>
      </div>
      <div className="control-row">
        <label>BPM <input type="number" value={transport.bpm} onChange={(e) => setTransport({ bpm: Number(e.target.value) })} /></label>
        <label>Loop start <input type="number" min={0} value={transport.loopStartBeat} onChange={(e) => setTransport({ loopStartBeat: Number(e.target.value) })} /></label>
        <label>Loop end <input type="number" min={1} value={transport.loopEndBeat} onChange={(e) => setTransport({ loopEndBeat: Number(e.target.value) })} /></label>
        <label><input type="checkbox" checked={transport.metronomeEnabled} onChange={(e) => setTransport({ metronomeEnabled: e.target.checked })} /> Metronome</label>
        <select value={transport.countInBars} onChange={(e) => setTransport({ countInBars: Number(e.target.value) as 0|1|2 })}><option value={0}>0-bar</option><option value={1}>1-bar</option><option value={2}>2-bar</option></select>
      </div>
    </header>
  );
}
