import { useNavigation } from '../../context/NavigationContext';

export default function PagePlaceholder() {
  const { currentRouteMeta } = useNavigation();

  return (
    <div className="glass-card" style={{ padding: '28px', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '1.3rem', margin: '0 0 8px 0' }}>{currentRouteMeta?.title || 'Aegis'}</h1>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        {currentRouteMeta?.description || 'This page is not wired to the proxy.'}
      </p>
    </div>
  );
}
