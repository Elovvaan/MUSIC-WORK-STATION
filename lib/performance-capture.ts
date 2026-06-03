import { MidiClip, MidiNote } from "@/lib/types/models";

export function recordMidiIntoClip(projectId: string, trackId: string, events: Array<{note:number; velocity:number; on:boolean; time:number}>): MidiClip {
  const active = new Map<number, { start: number; velocity: number }>();
  const notes: MidiNote[] = [];
  events.forEach((event) => {
    if (event.on) active.set(event.note, { start: event.time, velocity: event.velocity });
    else {
      const start = active.get(event.note);
      if (!start) return;
      notes.push({ id: crypto.randomUUID(), note: event.note, start: start.start, duration: Math.max(0.125, event.time - start.start), velocity: start.velocity, channel: 0 });
      active.delete(event.note);
    }
  });

  return { id: crypto.randomUUID(), projectId, trackId, startBar: 1, endBar: 9, startBeat: 0, durationBeats: 32, loopEnabled: false, notes };
}
