export default function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid rgba(244, 63, 94, 0.45)',
        background: 'rgba(244, 63, 94, 0.12)',
        color: '#fb7185',
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );
}
