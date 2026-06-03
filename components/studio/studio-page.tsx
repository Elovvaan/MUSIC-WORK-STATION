"use client";
import { useEffect } from "react";
import { useAppStore } from "@/lib/state/app-store";
import { logEvent } from "@/lib/intelligence/telemetry";

function TrackList() {
  const tracks = useAppStore((s) => s.tracks);
  return (
    <div className="panel">
      <h3>Track List</h3>
      <ul>{tracks.map((track) => <li key={track.id}>{track.name} - {track.isArmed ? "armed" : "disarmed"} / {track.type}</li>)}</ul>
    </div>
  );
}
function TimelineShell() {
  const midiClips = useAppStore((s) => s.midiClips);
  return (
    <div className="panel">
      <h3>Multitrack Timeline</h3>
      <div className="grid-2">
        <div className="panel"><h4>Waveform Region Lane</h4><p>Audio clip shell with clip boundaries and fade handles.</p></div>
        <div className="panel"><h4>MIDI Clip Lane</h4><p>Recorded sampler MIDI clips: {midiClips.length}</p></div>
      </div>
    </div>
  );
}
function EditorShell() { return <div className="grid-2"><div className="panel"><h3>Piano Roll</h3><p>Grid editor lane with note velocity and quantize hooks.</p></div><div className="panel"><h3>Drum Grid</h3><p>Pad grid editor for pattern programming and swing.</p></div></div>; }

export function StudioPage({ projectId }: { projectId: string }) {
  const logTelemetry = useAppStore((s) => s.logTelemetry);
  const ensureSamplerTrack = useAppStore((s) => s.ensureSamplerTrack);
  const transport = useAppStore((s) => s.transport);
  const saveStatus = useAppStore((s) => s.saveStatus);
  useEffect(() => {
    ensureSamplerTrack();
    const id = setInterval(() => logTelemetry(logEvent("save", "project", { projectId })), 12000);
    return () => clearInterval(id);
  }, [ensureSamplerTrack, logTelemetry, projectId]);

  return (
    <>
      <section className="panel"><h1>Studio</h1><div className="control-row"><span>Metronome: {transport.metronomeEnabled ? "On" : "Off"}</span><span>Count-In: {transport.countInBars} bar</span><span>Loop: {transport.loopEnabled ? "On" : "Off"}</span><span>Autosave: {saveStatus}</span></div></section>
      <TrackList />
      <TimelineShell />
      <EditorShell />
    </>
  );
}
