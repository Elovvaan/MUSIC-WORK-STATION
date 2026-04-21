export interface MidiDevice { id: string; name: string; manufacturer: string; state: string; connection: string; }

export async function getMidiDevices(): Promise<MidiDevice[]> {
  if (!("requestMIDIAccess" in navigator)) return [];
  const access = await navigator.requestMIDIAccess({ sysex: false });
  return Array.from(access.inputs.values()).map((input) => ({
    id: input.id, name: input.name ?? "Unknown", manufacturer: input.manufacturer ?? "Unknown", state: input.state, connection: input.connection
  }));
}

export const parseMidiMessage = (data: Uint8Array) => {
  const [status, note, velocity] = data;
  const command = status >> 4;
  const channel = status & 0x0f;
  return { command, channel, note, velocity };
};
