export function DashboardPage() {
  return (
    <>
      <section className="panel"><h1>Dashboard</h1><div className="grid-3"><article className="panel"><h3>New Project</h3><p>Set BPM, key, and template with private creator defaults.</p></article><article className="panel"><h3>Recent Projects</h3><p>Resume active drafts with autosave recovery checkpoints.</p></article><article className="panel"><h3>Quick Launch</h3><p>Jump straight into Studio, Vocal Lab, Sampler, or Exports.</p></article></div></section>
      <section className="grid-2"><div className="panel"><h3>Saved Style Profiles</h3><p>Desktop-first profile list with BPM/key/mood tags.</p></div><div className="panel"><h3>Session Metrics</h3><p>Open projects, exports, and reusable presets this week.</p></div></section>
    </>
  );
}
