export function ExportsPage() {
  return (
    <>
      <section className="panel"><h1>Exports</h1><div className="control-row"><select><option>mp3</option><option>wav</option><option>midi</option><option>vocal_stem</option></select><input placeholder="Version label" /><button>Create Export</button></div></section>
      <section className="panel"><h3>Export History</h3><p>Named versions with download actions and statuses.</p></section>
    </>
  );
}
