import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import PagePlaceholder from './PagePlaceholder';
import { ApiService } from '../../services/api';

export default function GlobalLayout({ children }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('ai_guardian_sidebar_collapsed');
      return stored === 'true';
    } catch (e) {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  // Synchronize desktop collapse state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai_guardian_sidebar_collapsed', String(isCollapsed));
    } catch (e) {
      // Ignore
    }
  }, [isCollapsed]);

  // Keyboard shortcut listener: Ctrl+\ to toggle sidebar, Escape to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setIsCollapsed(prev => !prev);
      } else if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    const tick = () => {
      ApiService.getStats().catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // Prevent background scroll when mobile sidebar drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="layout-shell">
      {/* Mobile Drawer Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Responsive Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapse={toggleCollapse}
      />

      {/* Main View Area */}
      <div className={`layout-main-wrapper ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Top Header */}
        <Header
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        {/* Dynamic Page Container */}
        <main className="layout-page-content" id="main-content">
          {children || <PagePlaceholder />}
        </main>

        {/* Operational Status Bar */}
        <StatusBar />
      </div>
    </div>
  );
}
