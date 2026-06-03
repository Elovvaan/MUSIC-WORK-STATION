# MUSIC-WORK-STATION Local Setup for Windows Desktop Testing

This handoff is for local Windows desktop testing of the current MIDI/audio workflow. It does not require a backend database for the sampler workflow; autosave falls back to browser `localStorage` when the local API has no saved project snapshot.

## Requirements

- **Windows 10 or Windows 11** desktop/laptop.
- **Node.js 22 LTS recommended**. The app dependency set also supports Node.js `^18.18.0`, `^19.8.0`, or `>=20.0.0`, but Node 22 LTS matches the project tooling target.
- **Recommended browser:** Google Chrome or Microsoft Edge.
- A connected audio output device such as speakers, headphones, or an audio interface.
- Optional for MIDI testing: a USB MIDI keyboard/controller connected before browser MIDI initialization.

## Exact Windows Setup Steps

1. **Extract or copy the project folder** to a simple path such as:

   ```powershell
   C:\Users\YOUR_NAME\Desktop\MUSIC-WORK-STATION
   ```

2. **Open PowerShell.**
   - Press **Windows**.
   - Type **PowerShell**.
   - Click **Windows PowerShell** or **Terminal**.

3. **Go to the project folder.** Replace `YOUR_NAME` with your Windows user name, or use the path where you extracted the handoff package:

   ```powershell
   cd C:\Users\YOUR_NAME\Desktop\MUSIC-WORK-STATION
   ```

4. **Confirm Node.js is available.**

   ```powershell
   node -v
   npm -v
   ```

   Expected: Node should print version `v22.x.x` if using the recommended Node.js 22 LTS install.

5. **Install dependencies.**

   ```powershell
   npm install
   ```

6. **Run the development server.**

   ```powershell
   npm run dev
   ```

7. **Open the app in Chrome or Edge.**

   ```text
   http://localhost:3000
   ```

8. **Open the Sampler page.**
   - Click **Sampler** in the left navigation, or open:

   ```text
   http://localhost:3000/sampler
   ```

## Audio Setup and Basic Sound Test

1. Open `http://localhost:3000/sampler` in Chrome or Edge.
2. Click **Enable Audio** at the top of the Sampler page.
3. Confirm the button changes to **Audio Ready** or the **Audio Engine Runtime** panel shows a ready/running audio context.
4. Under **Playback**, click the note buttons such as **C4**, **D4**, **E4**, **G4**, and **C5**.
5. Confirm the default built-in soft piano sample plays through your selected Windows output device.
6. If notes hang or sound continues unexpectedly, click **All Notes Off** on the Sampler page.

## MIDI Keyboard Test

1. Connect the USB MIDI keyboard/controller to Windows before initializing MIDI in the browser.
2. Open Chrome or Edge and go to:

   ```text
   http://localhost:3000/sampler
   ```

3. Click **Enable MIDI**.
4. Approve the browser **Web MIDI** permission prompt if it appears.
5. Confirm the **MIDI Runtime** panel changes from `No MIDI inputs detected` to showing your controller name.
6. Play keys on the MIDI keyboard.
7. Confirm **MIDI activity** updates with note names and velocity.
8. Confirm keys trigger sound from the sampler.
9. Confirm chromatic pitch changes as you play lower and higher keys.
10. Hold multiple keys at the same time and confirm polyphony works.

## Sampler Workflow Test

1. Open `http://localhost:3000/sampler`.
2. Click **Enable Audio**.
3. Use the **Playback** note buttons to confirm the default test instrument plays.
4. Optional: click **Enable MIDI** and test the keyboard as described above.
5. Use the **Root Note Assignment** dropdown only if you need to verify root-note behavior; leave it at the default for the basic handoff test.
6. Use **All Notes Off** if any sound becomes stuck.

## Record a MIDI Phrase

1. Open `http://localhost:3000/sampler`.
2. Click **Enable Audio**.
3. If using a hardware keyboard, click **Enable MIDI** and confirm your keyboard appears.
4. In the top transport bar, leave **Metronome** enabled if you want click feedback.
5. Choose the count-in length in the top transport dropdown, such as **1-bar**.
6. Click **Record** in the top transport.
7. Wait for the count-in to finish if enabled.
8. Play a short phrase on the MIDI keyboard. The Sampler page note buttons are for auditioning sound only and do not create recorded MIDI notes.
9. Click **Stop Rec** in the top transport.
10. Confirm **Recorded MIDI clips this session** increases and one clip appears in **Sampler Timeline**.

## Replay the Recorded Phrase

1. Click **Return** in the top transport to reset the playhead to beat 0.
2. Click **Play**.
3. Confirm the recorded clip replays through the sampler.
4. Click **Stop** when finished.

## Loop Test

1. In the top transport, set **Loop start** and **Loop end** to cover the recorded phrase, for example start `0` and end `16`.
2. Click **Loop: Off** so it changes to **Loop: On**.
3. Click **Return**.
4. Click **Play**.
5. Confirm playback wraps from the loop end back to the loop start.
6. To test clip-level looping, select the clip in **Sampler Timeline** and click **Clip loop: Off** so it changes to **Clip loop: On**.

## Metronome and Count-in Test

1. Make sure the top transport **Metronome** checkbox is checked.
2. Click **Play** and confirm the metronome clicks during playback.
3. Click **Stop**.
4. Select **1-bar** or **2-bar** in the count-in dropdown.
5. Click **Record**.
6. Confirm the top transport shows the count-in beats before recording starts.
7. Set the dropdown to **0-bar** if you want recording to start immediately.

## Autosave and Reload Test

1. Record a MIDI phrase so a clip appears in **Sampler Timeline**.
2. Wait until the Sampler page displays **Autosave: saved**.
3. Refresh the browser tab.
4. Return to `http://localhost:3000/sampler` if needed.
5. Confirm the MIDI clip is restored in **Sampler Timeline**.
6. Confirm sampler settings such as BPM, loop settings, and root note are restored if you changed them before saving.

## Troubleshooting

### npm install shows a 403 registry error

1. Check the active npm registry:

   ```powershell
   npm config get registry
   ```

2. Set npm back to the public npm registry:

   ```powershell
   npm config set registry https://registry.npmjs.org/
   ```

3. Clear the npm cache:

   ```powershell
   npm cache clean --force
   ```

4. Try installing again:

   ```powershell
   npm install
   ```

### Use pnpm if npm still fails

1. Enable Corepack:

   ```powershell
   corepack enable
   ```

2. Prepare pnpm:

   ```powershell
   corepack prepare pnpm@latest --activate
   ```

3. Install dependencies with pnpm:

   ```powershell
   pnpm install
   ```

4. Run the dev server with pnpm:

   ```powershell
   pnpm dev
   ```

### Browser audio is blocked until a user gesture

Browsers do not start Web Audio automatically. Click **Enable Audio** on the Sampler page before expecting sound. If audio still does not start, click in the page once, click **Enable Audio** again, then press a note button under **Playback**.

### Web MIDI permission prompt does not appear

Use Chrome or Edge and click **Enable MIDI** from the Sampler page. If permission was previously denied, open the browser site settings for `localhost`, clear or allow MIDI permissions, refresh the page, and click **Enable MIDI** again.

### MIDI keyboard is not detected

- Connect the keyboard directly by USB before clicking **Enable MIDI**.
- Confirm the keyboard is powered on.
- Avoid opening another DAW or MIDI utility that may exclusively claim the device.
- Unplug and reconnect the keyboard, then click **Refresh MIDI**.
- Try a different USB cable or USB port.
- Restart Chrome or Edge if the device still does not appear.

### No sound output

- Click **Enable Audio**.
- Confirm Windows output is not muted and the correct output device is selected.
- Confirm Chrome/Edge is not muted in the Windows volume mixer.
- Raise the Sampler page **Master gain** slider.
- Try the note buttons under **Playback** before testing external MIDI.
- Try headphones or a different audio output device.

### Stuck notes or hanging sound

- Click **All Notes Off** on the Sampler page.
- Click **Stop** in the top transport.
- Release the sustain pedal if one is connected.
- Unplug/reconnect the MIDI keyboard, then click **Refresh MIDI**.
- Refresh the browser tab if needed.

### Port already in use

If `npm run dev` says port `3000` is already in use, run the dev server on another port:

```powershell
npm run dev -- -p 3001
```

Then open:

```text
http://localhost:3001
```

## Local Manual Test Checklist

- [ ] App opens at `http://localhost:3000`.
- [ ] Sampler page opens at `http://localhost:3000/sampler`.
- [ ] **Enable Audio** works.
- [ ] Default test instrument plays from the **Playback** note buttons.
- [ ] MIDI keyboard appears in the **MIDI Runtime** panel.
- [ ] MIDI keys trigger sampler sound.
- [ ] Chromatic pitch changes across keys.
- [ ] Polyphony works when holding multiple notes.
- [ ] **Record** creates one MIDI clip after one recording pass.
- [ ] **Play** replays the recorded clip.
- [ ] Loop playback works with **Loop: On**.
- [ ] Autosave shows **saved**.
- [ ] Reload restores the clip.
- [ ] Metronome works during playback/recording.
- [ ] Count-in works before recording when set to **1-bar** or **2-bar**.

## Current Known Blockers / Limits

- Browser validation is intentionally stopped for now per handoff direction.
- Web MIDI requires Chrome or Edge; browsers without Web MIDI support will show MIDI as unsupported.
- Web Audio starts only after a user gesture such as clicking **Enable Audio**.
- The current sampler workflow uses a built-in test instrument and browser/local persistence fallback for desktop testing.
- Recording a MIDI clip currently requires MIDI note input from a Web MIDI device; the on-page audition note buttons are sound checks only.
