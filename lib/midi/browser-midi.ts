export type MidiRuntimeEvent = {
  type: "noteon" | "noteoff" | "controlchange";
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  channel: number;
  receivedAt: number;
  sourceName: string;
};

export type MidiRuntimeState = {
  status: "idle" | "requesting" | "ready" | "unsupported" | "error";
  inputs: { id: string; name: string; manufacturer?: string; state?: string }[];
  lastEvent?: MidiRuntimeEvent;
  sustainActive: boolean;
  error?: string;
};

type MidiListener = (event: MidiRuntimeEvent) => void;
type StateListener = (state: MidiRuntimeState) => void;

type MidiAccessLike = {
  inputs: { forEach: (callback: (input: MidiInputLike) => void) => void; values: () => IterableIterator<MidiInputLike> };
  onstatechange: ((event: { port: MidiInputLike }) => void) | null;
};

type MidiInputLike = {
  id: string;
  name?: string;
  manufacturer?: string;
  state?: string;
  onmidimessage: ((event: { data: Uint8Array; receivedTime: number; currentTarget?: MidiInputLike }) => void) | null;
};

export class BrowserMidiRuntime {
  private access?: MidiAccessLike;
  private listeners = new Set<MidiListener>();
  private stateListeners = new Set<StateListener>();
  private sustainedNotes = new Set<number>();
  private heldNotes = new Set<number>();
  private state: MidiRuntimeState = { status: "idle", inputs: [], sustainActive: false };

  subscribe(listener: StateListener) {
    this.stateListeners.add(listener);
    listener(this.snapshot());
    return () => this.stateListeners.delete(listener);
  }

  onMidi(listener: MidiListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return { ...this.state, inputs: [...this.state.inputs] };
  }

  async initialize() {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      this.emitState({ status: "unsupported", error: "Web MIDI is not available in this browser." });
      return;
    }

    this.emitState({ status: "requesting", error: undefined });
    try {
      const requestMIDIAccess = (navigator as unknown as { requestMIDIAccess: (options?: { sysex?: boolean }) => Promise<MidiAccessLike> }).requestMIDIAccess;
      const access = await requestMIDIAccess({ sysex: false });
      this.access = access;
      access.onstatechange = () => this.refreshInputs();
      this.refreshInputs();
      this.emitState({ status: "ready" });
    } catch (error) {
      this.emitState({ status: "error", error: error instanceof Error ? error.message : "MIDI initialization failed" });
    }
  }

  private refreshInputs() {
    if (!this.access) return;
    this.access.inputs.forEach((input) => { input.onmidimessage = (event) => this.handleMessage(input, event.data, event.receivedTime); });
    this.emitState({
      inputs: [...this.access.inputs.values()].map((input) => ({ id: input.id, name: input.name ?? "MIDI Input", manufacturer: input.manufacturer, state: input.state })),
    });
  }

  private handleMessage(input: MidiInputLike, data: Uint8Array, receivedAt: number) {
    const [statusByte, data1 = 0, data2 = 0] = data;
    const command = statusByte & 0xf0;
    const channel = (statusByte & 0x0f) + 1;
    const sourceName = input.name ?? "MIDI Input";
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const timestamp = receivedAt || now;

    if (command === 0x90 && data2 > 0) {
      this.heldNotes.add(data1);
      this.dispatch({ type: "noteon", note: data1, velocity: data2, channel, receivedAt: timestamp, sourceName });
      return;
    }

    if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      this.heldNotes.delete(data1);
      if (this.state.sustainActive) {
        this.sustainedNotes.add(data1);
      } else {
        this.dispatch({ type: "noteoff", note: data1, velocity: data2, channel, receivedAt: timestamp, sourceName });
      }
      return;
    }

    if (command === 0xb0) {
      const isSustain = data1 === 64;
      if (isSustain) this.handleSustain(data2, channel, timestamp, sourceName);
      this.dispatch({ type: "controlchange", controller: data1, value: data2, channel, receivedAt: timestamp, sourceName });
    }
  }

  private handleSustain(value: number, channel: number, receivedAt: number, sourceName: string) {
    const sustainActive = value >= 64;
    if (sustainActive === this.state.sustainActive) return;
    this.emitState({ sustainActive });
    if (!sustainActive) {
      const notesToRelease = [...this.sustainedNotes].filter((note) => !this.heldNotes.has(note));
      this.sustainedNotes.clear();
      notesToRelease.forEach((note) => this.dispatch({ type: "noteoff", note, velocity: 0, channel, receivedAt, sourceName }));
    }
  }

  private dispatch(event: MidiRuntimeEvent) {
    this.emitState({ lastEvent: event });
    this.listeners.forEach((listener) => listener(event));
  }

  private emitState(partial: Partial<MidiRuntimeState>) {
    this.state = { ...this.state, ...partial };
    const snapshot = this.snapshot();
    this.stateListeners.forEach((listener) => listener(snapshot));
  }
}

export const midiRuntime = new BrowserMidiRuntime();
