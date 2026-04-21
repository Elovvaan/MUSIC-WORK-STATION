"use client";
import { useEffect } from "react";
import { useAppStore } from "@/lib/state/app-store";
import { logEvent } from "@/lib/intelligence/telemetry";

function TrackList() { return <div className="panel"><h3>Track List</h3><ul><li>Kick - mute/solo/arm</li><li>Bass MIDI - mute/solo/arm</li><li>Lead Vocal - mute/solo/arm</li></ul></div>; }
function TimelineShell() { return <div className="panel"><h3>Multitrack Timeline</h3><div className="grid-2"><div className="panel"><h4>Waveform Region Lane</h4><p>Audio clip shell with clip boundaries and fade handles.</p></div><div className="panel"><h4>MIDI Clip Lane</h4><p>MIDI region shell prepared for recorded performance clips.</p></div></div></div>; }
function EditorShell() { return <div className="grid-2"><div className="panel"><h3>Piano Roll</h3><p>Grid editor lane with note velocity and quantize hooks.</p></div><div className="panel"><h3>Drum Grid</h3><p>Pad grid editor for pattern programming and swing.</p></div></div>; }

export function StudioPage({ projectId }: { projectId: string }) {
  const logTelemetry = useAppStore((s) => s.logTelemetry);
  useEffect(() => {
    const id = setInterval(() => logTelemetry(logEvent("save", "project", { projectId })), 12000);
    return () => clearInterval(id);
  }, [logTelemetry, projectId]);

  return (
    <>
      <section className="panel"><h1>Studio</h1><div className="control-row"><button>Metronome</button><button>Count-In</button><button>Loop</button><button>Overdub</button><button>Autosave: Active</button></div></section>
      <TrackList />
      <TimelineShell />
      <EditorShell />
    </>
  );
}
