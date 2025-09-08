export default function HomePage() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Aspire Payments</h1>
      <p style={{ color: '#555' }}>Home is up. Go to <a href="/customers" style={{ textDecoration: 'underline' }}>Customers</a>.</p>
    </div>
  );
}
