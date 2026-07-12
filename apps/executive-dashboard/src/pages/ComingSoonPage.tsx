export function ComingSoonPage({ label }: { label: string }) {
  return (
    <section className="coming-soon">
      <h2>{label}</h2>
      <p>Module coming next. This section is intentionally non-operational in v1.</p>
    </section>
  );
}
