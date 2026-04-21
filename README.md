# MUSIC-WORK-STATION — Phase 1 V1 Blueprint

## 1. Product Architecture

### 1.1 Runtime Architecture (desktop-first, Chrome-first)
- **Client (Next.js App Router + TypeScript)**
  - Studio-grade UI shell (left nav + top transport + context inspector + bottom timeline tools).
  - Web Audio engine host (AudioContext + AudioWorklet graph).
  - Web MIDI manager for USB keyboard/pad controller detection and input routing.
  - Realtime state layer (Zustand/Redux Toolkit) for transport, arrangement, and selected tool state.
- **API Layer (Next.js Route Handlers /api/***)
  - Authenticated private single-user APIs for projects, tracks, stems, MIDI, jobs, presets, and exports.
  - Upload handshake endpoints for direct object storage writes.
- **Async Worker Layer (Node workers + queue)**
  - AI continuation jobs.
  - Sampler analysis jobs.
  - Vocal restoration/enhancement/master jobs.
  - Song mastering jobs.
  - Embedding + intelligence feature extraction jobs.
- **Data Layer**
  - PostgreSQL (core relational entities + job state + event logging).
  - Redis (job queue + short-term session cache).
  - Object storage (audio/stems/samples/exports/project assets).
  - Vector store (pgvector in Postgres for taste/sound/project embeddings).

### 1.2 Service Boundaries
- **Project Service**: project/track/clip/arrangement CRUD + autosave snapshots.
- **Performance Service**: MIDI device profiles + controller mappings + takes.
- **Sampler Service**: sample analysis + patch generation + key/slice mapping.
- **AI Create Service**: prompt + continuation orchestration.
- **Vocal Lab Service**: restoration/enhancement/master pipeline execution.
- **Mastering Service**: full mix/song finalization.
- **Intelligence Service**: event ingestion, feature extraction, embeddings, preference profiles.
- **Export Service**: render pipeline, file packaging, versioning.

### 1.3 Core Principles in Architecture
- Human-first by default: every AI route requires source context (MIDI clip/audio/vocal/prompt) unless explicit Generate Mode.
- Hard pipeline separation: Vocal Lab restoration, enhancement, and vocal master are separate job stages and artifacts.
- Sampler as first-class instrument: any sample can instantiate a SamplerPatch playable via MIDI.
- Private creator scope: single-user tenancy model with strict project privacy and no social entities.

---

## 2. Page Map

- `/` → **Dashboard**
- `/studio/[projectId]` → **Studio**
- `/ai-create` and `/ai-create/[projectId]` → **AI Create**
- `/my-sound` → **My Sound**
- `/vocal-lab` and `/vocal-lab/[assetId]` → **Vocal Lab**
- `/sampler` and `/sampler/[patchId]` → **Sampler**
- `/performance` → **Performance**
- `/mastering` and `/mastering/[projectId]` → **Mastering**
- `/exports` and `/exports/[projectId]` → **Exports**
- `/settings` → **Settings**

---

## 3. User Flow

### 3.1 Primary End-to-End Flow
1. Dashboard → create project (tempo/key/template).
2. Studio opens with armed audio + MIDI tracks.
3. Connect MIDI controller in Performance panel (or performance page).
4. Record riff/drums/vocal in Studio.
5. If needed, upload sample in Sampler and click **Turn into Instrument**.
6. Play sample chromatically from keyboard/pads; record MIDI take.
7. Open AI Create in Assist Mode → continue from selected clip/take/vocal.
8. Accept/reject AI variations; drag accepted output to timeline.
9. Run Vocal Lab on vocal tracks (Restoration → Enhancement → Vocal Master).
10. Return to Studio for balance and arrangement.
11. Open Mastering for final song polish (Quick/Pro/Restore+Master).
12. Export MP3/WAV/MIDI/cleaned vocal stem with versioned name.
13. Intelligence layer logs actions and updates preference signals/embeddings.

### 3.2 Mode Logic
- **Manual Mode** default in Studio.
- **Assist Mode** requires selected user input source.
- **Generate Mode** explicit toggle + confirmation dialog.

---

## 4. Database Schema (PostgreSQL)

### 4.1 Core Tables
- `users(id, email, display_name, created_at, updated_at)`
- `projects(id, user_id, name, bpm, key, scale, time_signature, status, created_at, updated_at, last_opened_at)`
- `project_sections(id, project_id, name, start_bar, end_bar, color, created_at)`
- `tracks(id, project_id, type[audio|midi|vocal|sampler|bus], name, order_index, is_muted, is_solo, volume, pan, color, created_at, updated_at)`
- `stems(id, project_id, track_id, storage_path, format, sample_rate, bit_depth, duration_sec, waveform_json, created_at)`
- `midi_clips(id, project_id, track_id, start_bar, end_bar, ppq, notes_json, quantize_pct, swing_pct, transpose_semitones, created_at, updated_at)`
- `performance_takes(id, project_id, track_id, source_device_id, take_type[keys|pads], raw_midi_json, velocity_stats_json, created_at)`

### 4.2 Performance + Controller Tables
- `midi_device_profiles(id, user_id, device_name, manufacturer, input_port_name, is_default, created_at, updated_at)`
- `controller_mappings(id, profile_id, mapping_name, mapping_json, created_at, updated_at)`

### 4.3 Sampler Tables
- `sample_assets(id, user_id, project_id, name, storage_path, format, duration_sec, sample_rate, channels, detected_root_note, detected_octave, tonal_class, transient_profile_json, created_at)`
- `sampler_patches(id, user_id, project_id, name, mode[one_shot|chromatic|slice|loop], sample_asset_id, root_note, root_octave, transpose, fine_tune_cents, adsr_json, loop_json, velocity_response_json, created_at, updated_at)`
- `root_note_maps(id, patch_id, midi_note, pitch_offset_semitones, playback_rate, created_at)`
- `key_zones(id, patch_id, zone_name, low_note, high_note, sample_start_ms, sample_end_ms, gain_db, pan, created_at)`
- `slice_maps(id, patch_id, slice_index, start_ms, end_ms, assigned_pad_note, created_at)`
- `instrument_presets(id, user_id, name, source_patch_id, tags_json, preset_json, created_at, updated_at)`

### 4.4 AI + Voice + Mastering + Export
- `prompt_presets(id, user_id, name, prompt_text, category, created_at, updated_at)`
- `style_profiles(id, user_id, name, bpm_range_json, key_preferences_json, mood_tags_json, sonic_tags_json, chain_refs_json, created_at, updated_at)`
- `ai_continuation_jobs(id, user_id, project_id, source_type[midi|audio|vocal|prompt], source_ref_id, request_json, status, output_refs_json, rejection_reason, created_at, updated_at)`
- `vocal_processing_jobs(id, user_id, project_id, stem_id, stage[analysis|restoration|enhancement|vocal_master], settings_json, metrics_json, output_stem_id, status, created_at, updated_at)`
- `mastering_jobs(id, user_id, project_id, mode[quick|pro|restore_master], input_mix_stem_id, settings_json, loudness_target_lufs, output_refs_json, status, created_at, updated_at)`
- `export_jobs(id, user_id, project_id, export_type[mp3|wav|midi|vocal_stem], version_label, options_json, output_path, status, created_at, updated_at)`

### 4.5 Intelligence Tables
- `preference_signals(id, user_id, project_id, signal_type, signal_value_json, weight, created_at)`
- `user_feedback_events(id, user_id, project_id, event_type[accepted|rejected|deleted|reused|edited|exported], target_type, target_id, metadata_json, created_at)`
- `sound_embeddings(id, user_id, sample_asset_id, vector, feature_json, created_at)`
- `project_embeddings(id, user_id, project_id, vector, feature_json, created_at)`
- `style_clusters(id, user_id, cluster_name, centroid_vector, summary_json, updated_at)`
- `continuation_patterns(id, user_id, pattern_key, pattern_stats_json, updated_at)`
- `arrangement_patterns(id, user_id, pattern_key, pattern_stats_json, updated_at)`
- `mastering_preference_profiles(id, user_id, profile_json, updated_at)`
- `instrument_usage_profiles(id, user_id, profile_json, updated_at)`

---

## 5. API Route Map

### 5.1 Project + Studio
- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `POST /api/projects/:id/autosave`
- `POST /api/projects/:id/tracks`
- `PATCH /api/tracks/:id`
- `POST /api/tracks/:id/stems/upload-url`
- `POST /api/tracks/:id/stems`
- `POST /api/tracks/:id/midi-clips`
- `PATCH /api/midi-clips/:id`

### 5.2 Performance + MIDI
- `GET /api/performance/midi-devices`
- `POST /api/performance/midi-device-profiles`
- `PATCH /api/performance/midi-device-profiles/:id`
- `POST /api/performance/controller-mappings`
- `PATCH /api/performance/controller-mappings/:id`
- `POST /api/performance/takes`

### 5.3 Sampler
- `POST /api/sampler/assets/upload-url`
- `POST /api/sampler/assets`
- `POST /api/sampler/analyze`
- `POST /api/sampler/turn-into-instrument`
- `POST /api/sampler/patches`
- `GET /api/sampler/patches/:id`
- `PATCH /api/sampler/patches/:id`
- `POST /api/sampler/patches/:id/slices/auto`

### 5.4 AI Create
- `POST /api/ai/continue`
- `POST /api/ai/generate`
- `GET /api/ai/jobs/:id`
- `POST /api/ai/jobs/:id/accept`
- `POST /api/ai/jobs/:id/reject`
- `GET /api/ai/prompt-presets`
- `POST /api/ai/prompt-presets`
- `GET /api/ai/style-profiles`
- `POST /api/ai/style-profiles`

### 5.5 Vocal Lab
- `POST /api/vocal-lab/upload-url`
- `POST /api/vocal-lab/analyze`
- `POST /api/vocal-lab/restoration`
- `POST /api/vocal-lab/enhancement`
- `POST /api/vocal-lab/vocal-master`
- `GET /api/vocal-lab/jobs/:id`

### 5.6 Mastering + Export + Intelligence
- `POST /api/mastering/quick`
- `POST /api/mastering/pro`
- `POST /api/mastering/restore-master`
- `GET /api/mastering/jobs/:id`
- `POST /api/exports`
- `GET /api/exports`
- `GET /api/exports/:id`
- `POST /api/intelligence/events`
- `GET /api/intelligence/recommendations/:projectId`

---

## 6. Audio Engine Design

### 6.1 Engine Layers
- **Transport Layer**: bpm, playhead, loop range, metronome, count-in, record state.
- **Graph Layer**: track buses, sends, master bus, sampler voices, monitor input.
- **Clip Scheduler**: sample-accurate scheduling aligned to bars/beats.
- **Recorder Layer**: mic input capture, track arm, overdub lane writing.
- **Render Layer**: offline export rendering (WAV/MP3 via worker pipeline).

### 6.2 Web Audio Components
- `AudioContext` + `AudioWorkletNode` for low-latency processing.
- Per-track chain: Input → trim/gain → mute/solo gate → insert FX slots → bus send.
- Waveform peak cache generated server-side and cached client-side.
- Timing clock from high-resolution scheduler thread; UI playhead interpolated separately.

### 6.3 Studio Features Mapping
- Trim/mute/solo/loop: transport + track state + scheduler.
- Overdub: merged MIDI/audio lane commit logic.
- Piano roll/drum grid: edit layer writes `midi_clips.notes_json`.
- Autosave: incremental dirty patches every N seconds and on transport stop.

---

## 7. MIDI/Performance Layer Design

### 7.1 Device Handling
- Use Web MIDI API: `navigator.requestMIDIAccess({ sysex: false })`.
- Device manager service stores active input ports and last-seen timestamps.
- Reconnect strategy: auto-bind by profile matching (`manufacturer + name + port`).

### 7.2 Input Pipeline
- Raw MIDI message parser (note on/off, CC, pitch bend, aftertouch).
- Route to focused instrument/track or armed tracks.
- Capture velocity, timestamp, channel, and source device id.

### 7.3 Performance Editing
- Quantize engine: grid + strength percentage.
- Swing engine: off-beat delay function by subdivision.
- Note editor: transpose, length scale, velocity curve tools.
- Pad mapping: assign pad notes to sampler slices or drum lanes.

### 7.4 Profiles + Mappings
- Profile presets per controller.
- Mapping layers for pads/knobs/faders.
- Fast toggle: “Studio Default”, “Sampler Performance”, “Drum Programming”.

---

## 8. Sampler Engine Design

### 8.1 Modes
- **One-Shot**: fixed pitch optional, no keytracking by default.
- **Chromatic**: pitch maps all MIDI notes relative to root note.
- **Slice**: transient-based or manual slices mapped to pads/keys.
- **Loop Instrument**: sustained playback using loop points + envelope.

### 8.2 Chromatic Mapping Logic
- Determine root note (auto detection + manual override).
- For each MIDI note `n`, compute `offset = n - rootMidi`.
- Playback rate `2^(offset/12)` with fine tune cents adjustment.
- Polyphony: voice allocator with max voice limit + oldest/release stealing.

### 8.3 Patch Parameters
- Global: transpose, fine tune, gain, pan.
- Envelope: A/D/S/R and velocity-to-amp modulation.
- Playback window: start/end offset.
- Loop: loop start/end, crossfade, sustain behavior.
- Key zones: split keyboard regions for multi-zone patch behavior.

### 8.4 AI-Assisted Sampler
- Analyze sample for tonal/percussive identity, pitch confidence, transient density.
- Suggest best mode:
  - tonal sustained → chromatic/loop instrument.
  - short transient hit → one-shot/slice.
- One-click action creates `sampler_patch + root_note_maps + key_zones`.

---

## 9. Vocal Lab Pipeline Design

### 9.1 Stage A — Restoration (separate artifact)
1. Diagnostic analysis: clipping/noise/hum/reverb/distortion/harshness/low-level.
2. Corrective chain order:
   - de-noise
   - de-hum
   - de-click/mouth cleanup
   - de-reverb
   - clipping repair
   - distortion mitigation
   - optional vocal isolation
3. Output artifact: `restored_vocal_stem.wav` + metrics report.

### 9.2 Stage B — Enhancement (separate artifact)
- Corrective EQ → de-esser → compression → leveling → tonal shaper (body/air/presence) → optional saturation.
- Output artifact: `enhanced_vocal_stem.wav`.

### 9.3 Stage C — Vocal Master (separate artifact)
- Loudness target normalization.
- Tonal target matching.
- Consistency pass across phrases.
- Final limiter.
- Output artifact: `vocal_master_stem.wav`.

### 9.4 Vocal Lab UI Contract
- Upload, auto-analyze, flagged issue list with severity.
- Before/after A/B with gain-matched compare.
- Stage-specific control groups.
- Preset style apply/override.
- Export cleaned/mastered vocal stem.

---

## 10. Mastering Pipeline Design

### 10.1 Modes
- **Quick Master**: one-click chain with style + loudness target.
- **Pro Master**: exposes tonal contour, dynamics, stereo width, limiter behavior.
- **Restore + Master**: pre-master cleanup then master chain.

### 10.2 Processing
1. Input validation (headroom, clipping scan, mono compatibility check).
2. Tonal balancing (genre/style-aware tilt + resonant correction).
3. Dynamics (multiband compression + transient management).
4. Stereo imaging (controlled width + phase guardrails).
5. Vocal/beat-forward weighting profile.
6. Limiter + loudness target.
7. Alternate prints (e.g., streaming, loud club, vocal-forward alt).

### 10.3 Outputs
- Master WAV + MP3 + alternate versions.
- A/B compare metadata (level-matched references).

---

## 11. Intelligence Layer Design

### 11.1 Three Intelligence Contexts
- **Session Intelligence** (per open project): bpm/key/scale/chord center/section/instrument role graph.
- **Creator Intelligence** (cross-project): recurring styles, preferred keys/bpm, favorite chains, acceptance patterns.
- **Sound Intelligence** (asset-level): pitch/timbre/transient/envelope/texture embeddings + similarity index.

### 11.2 Event Ingestion
- Client emits event stream for create/save/edit/reject/export/reuse/delete actions.
- Events written to `user_feedback_events` and transformed into weighted `preference_signals`.

### 11.3 Feature + Embedding Jobs
- Sound feature extractor on ingest.
- Project-level embedding after significant saves/exports.
- Cluster updater groups behavior into style clusters.

### 11.4 Recommendation Outputs (Phase 1)
- Preferred bpm/key/style suggestions.
- Continuation hints from past accepted patterns.
- Recommended mastering/vocal presets from prior approvals.

---

## 12. Phased Implementation Order

1. **Foundation**: Next.js app shell, auth, DB, storage, queue, design system.
2. **Project + Studio Core**: timeline, transport, audio upload, recording, MIDI clip edit, autosave.
3. **Performance Layer**: Web MIDI detection, routing, controller profiles/mappings, take capture + quantize/swing tools.
4. **Sampler Core**: sample upload, one-shot/chromatic, patch editor, keyboard play, track recording.
5. **Sampler Advanced**: slice + loop instrument, AI analysis, one-click “turn into instrument”.
6. **AI Create**: assist continuation first (MIDI/audio/vocal), then explicit generate mode.
7. **Vocal Lab**: full A/B/C separated pipeline with UI controls + exports.
8. **Mastering**: quick/pro/restore-master with alternate versions + A/B.
9. **My Sound + Exports**: preset libraries, versioned exports, named export history.
10. **Intelligence Foundation**: event logging, embeddings, profile updates, recommendation API.
11. **Polish**: premium UX pass, keyboard shortcuts, latency tuning, stability hardening.

---

## 13. Exact Folder Structure

```txt
music-work-station/
  app/
    (workspace)/
      page.tsx                         # Dashboard
      studio/[projectId]/page.tsx
      ai-create/page.tsx
      ai-create/[projectId]/page.tsx
      my-sound/page.tsx
      vocal-lab/page.tsx
      vocal-lab/[assetId]/page.tsx
      sampler/page.tsx
      sampler/[patchId]/page.tsx
      performance/page.tsx
      mastering/page.tsx
      mastering/[projectId]/page.tsx
      exports/page.tsx
      exports/[projectId]/page.tsx
      settings/page.tsx
    api/
      projects/route.ts
      projects/[id]/route.ts
      projects/[id]/autosave/route.ts
      tracks/[id]/route.ts
      tracks/[id]/stems/route.ts
      tracks/[id]/stems/upload-url/route.ts
      tracks/[id]/midi-clips/route.ts
      midi-clips/[id]/route.ts
      performance/midi-devices/route.ts
      performance/midi-device-profiles/route.ts
      performance/midi-device-profiles/[id]/route.ts
      performance/controller-mappings/route.ts
      performance/controller-mappings/[id]/route.ts
      performance/takes/route.ts
      sampler/assets/route.ts
      sampler/assets/upload-url/route.ts
      sampler/analyze/route.ts
      sampler/turn-into-instrument/route.ts
      sampler/patches/route.ts
      sampler/patches/[id]/route.ts
      sampler/patches/[id]/slices/auto/route.ts
      ai/continue/route.ts
      ai/generate/route.ts
      ai/jobs/[id]/route.ts
      ai/jobs/[id]/accept/route.ts
      ai/jobs/[id]/reject/route.ts
      ai/prompt-presets/route.ts
      ai/style-profiles/route.ts
      vocal-lab/upload-url/route.ts
      vocal-lab/analyze/route.ts
      vocal-lab/restoration/route.ts
      vocal-lab/enhancement/route.ts
      vocal-lab/vocal-master/route.ts
      vocal-lab/jobs/[id]/route.ts
      mastering/quick/route.ts
      mastering/pro/route.ts
      mastering/restore-master/route.ts
      mastering/jobs/[id]/route.ts
      exports/route.ts
      exports/[id]/route.ts
      intelligence/events/route.ts
      intelligence/recommendations/[projectId]/route.ts
  components/
    shell/
    dashboard/
    studio/
    ai-create/
    my-sound/
    vocal-lab/
    sampler/
    performance/
    mastering/
    exports/
    settings/
    audio/
    midi/
    intelligence/
  lib/
    db/
      schema.prisma
      migrations/
    storage/
    queue/
    audio-engine/
      transport.ts
      scheduler.ts
      worklets/
      graph/
    midi/
      midi-manager.ts
      midi-parser.ts
      mapping-engine.ts
    sampler/
      sample-analysis.ts
      root-detect.ts
      patch-builder.ts
      voice-engine.ts
    ai/
      continuation-service.ts
      prompt-service.ts
    vocal/
      analysis.ts
      restoration.ts
      enhancement.ts
      vocal-master.ts
    mastering/
      quick-master.ts
      pro-master.ts
      restore-master.ts
    intelligence/
      event-ingest.ts
      signal-builder.ts
      embeddings.ts
      recommender.ts
  workers/
    index.ts
    jobs/
      ai-continuation.job.ts
      sampler-analysis.job.ts
      vocal-processing.job.ts
      mastering.job.ts
      export.job.ts
      embedding.job.ts
  styles/
  public/
  tests/
    unit/
    integration/
    e2e/
```

---

## 14. Exact Component List per Page

### Dashboard (`/`)
- `WorkspaceShell`
- `NewProjectCard`
- `RecentProjectsList`
- `ResumeProjectButton`
- `SavedStyleProfilesPanel`
- `QuickLaunchTiles` (Vocal Lab, Sampler, Studio, Exports)

### Studio (`/studio/[projectId]`)
- `StudioTopTransport`
- `TrackInspectorPanel`
- `TrackList`
- `TimelineRuler`
- `ArrangementSectionBar`
- `WaveformClipLane`
- `MidiClipLane`
- `PianoRollEditor`
- `DrumGridEditor`
- `RecordingArmControls`
- `MetronomeCountInControls`
- `OverdubToggle`
- `AutosaveStatusBadge`

### Performance (`/performance`)
- `MidiDeviceScanner`
- `ConnectedDevicesList`
- `DeviceConnectToggle`
- `LiveMidiMonitor`
- `PadInputMonitor`
- `ControllerMappingEditor`
- `ProfileSavePanel`
- `PerformanceQuantizePanel`
- `SwingTransposePanel`
- `VelocityLengthEditor`

### Sampler (`/sampler`, `/sampler/[patchId]`)
- `SampleUploadDropzone`
- `SampleWaveformViewer`
- `SamplerModeSelector`
- `RootNoteDetectorPanel`
- `KeyboardMapEditor`
- `PadMapEditor`
- `AdsrEnvelopeEditor`
- `LoopPointEditor`
- `StartEndOffsetEditor`
- `KeyZoneEditor`
- `SliceEditor`
- `PolyphonyTunePanel`
- `TurnIntoInstrumentButton`
- `SamplerPreviewKeyboard`

### AI Create (`/ai-create`)
- `CreationModeToggle` (Manual Assist Generate)
- `PromptInput`
- `PromptPresetPicker`
- `StylePresetPicker`
- `SourceContextSelector` (MIDI/sample/vocal)
- `ContinuationSettingsPanel`
- `GenerateIdeasPanel` (lyrics/beat/melody)
- `ArrangementVariationPanel`
- `AcceptRejectActions`

### Vocal Lab (`/vocal-lab`)
- `VocalUploadPanel`
- `VocalAutoAnalysisReport`
- `BeforeAfterPlayer`
- `RestorationControlPanel`
- `EnhancementControlPanel`
- `VocalMasterControlPanel`
- `VocalPresetSelector`
- `StageProgressTracker`
- `ExportCleanedStemButton`

### Mastering (`/mastering`)
- `MasterInputSelector`
- `MasterModeTabs` (Quick/Pro/Restore+Master)
- `MasterStyleSelector`
- `LoudnessTargetControl`
- `VocalBeatFocusControl`
- `MasterChainAdvancedPanel`
- `ABComparePlayer`
- `AlternateVersionsList`
- `ExportMasterActions`

### My Sound (`/my-sound`)
- `PromptPresetLibrary`
- `StyleProfileLibrary`
- `FavoriteBpmKeyMoodPanel`
- `VocalChainLibrary`
- `MasterStyleLibrary`
- `CreativeTemplateLibrary`

### Exports (`/exports`)
- `ExportJobCreator`
- `FormatSelector` (MP3/WAV/MIDI/Cleaned Vocal)
- `NamedVersionInput`
- `ExportHistoryTable`
- `DownloadActions`

### Settings (`/settings`)
- `AudioDeviceSettings`
- `LatencyBufferSettings`
- `MidiPermissionSettings`
- `StorageUsagePanel`
- `DefaultProjectSettings`
- `PrivacyDataControlPanel`

---

## 15. Exact MVP Cutline for Phase 1 (Premium + Fully Usable)

### 15.1 Must Ship (non-negotiable)
- Full desktop Studio workflow: create project, record vocal/audio/MIDI, edit arrangement, autosave.
- Web MIDI device detection + controller mapping + performance capture with quantize/swing.
- Sampler one-shot + chromatic + slice + loop modes, including root note mapping and playable keyboard instrument conversion.
- AI Assist continuation from user MIDI/audio/vocal source with accept/reject logging.
- Vocal Lab with true separated Restoration → Enhancement → Vocal Master pipeline and A/B UI.
- Song Mastering (Quick + Pro + Restore+Master), alternate versions, A/B compare.
- Exports with MP3/WAV/MIDI/cleaned vocal stem + named versions/history.
- Intelligence foundation: complete event logging, preference signals, sound/project embeddings, starter recommendations.

### 15.2 Defer to Phase 2 (while preserving premium feel)
- Real-time collaborative editing (not needed for private single creator).
- Advanced stem separation beyond practical vocal isolation fallback.
- Full marketplace-style preset exchange/social discovery (explicitly out of scope).
- Highly experimental generative agents that bypass human-first flow.

### 15.3 Quality Bar for “Premium” in Phase 1
- Stable low-latency monitoring/playback in Chrome desktop.
- Fast project open/save and resilient autosave recovery.
- Clean dark workstation UI with keyboard shortcuts and minimal modal friction.
- AI outputs always traceable to user source or explicit generate action.
- Audible value in Vocal Lab + Mastering outputs versus raw input.
