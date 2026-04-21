export function AiCreatePage() {
  return (
    <>
      <section className="panel"><h1>AI Create</h1><div className="control-row"><input placeholder="Describe continuation intent" /><button>Run Continuation</button></div></section>
      <section className="grid-2"><div className="panel"><h3>Prompt + Style Presets</h3><p>Prompt presets, style packs, and source-context continuation entry points.</p></div><div className="panel"><h3>Result Cards</h3><p>Audition candidates and save/reject with feedback logging.</p></div></section>
    </>
  );
}
