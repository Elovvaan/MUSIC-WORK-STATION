"use client";
import { useEffect, useState } from "react";
import { getMidiDevices } from "@/lib/midi/midi-manager";

export function PerformancePage() {
  const [devices, setDevices] = useState<Array<{id:string;name:string;manufacturer:string}>>([]);
  useEffect(() => { void getMidiDevices().then(setDevices); }, []);

  return (
    <>
      <section className="panel"><h1>Performance</h1><p>Web MIDI detection and live capture pipeline.</p></section>
      <section className="grid-2"><div className="panel"><h3>MIDI Device Manager</h3><ul>{devices.map((d) => <li key={d.id}>{d.name} — {d.manufacturer}</li>)}</ul></div><div className="panel"><h3>Input Monitor</h3><p>Note on/off, CC, velocity stream inspector.</p></div></section>
      <section className="grid-2"><div className="panel"><h3>Controller Profiles</h3><p>Studio Default, Sampler Performance, Drum Programming mappings.</p></div><div className="panel"><h3>MIDI Capture</h3><p>Captured events write into MIDI clip objects for selected track.</p></div></section>
    </>
  );
}
