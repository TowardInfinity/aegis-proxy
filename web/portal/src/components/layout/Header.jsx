import React, { useState } from 'react';
import { useTheme, THEMES } from '../../context/ThemeContext';
import { useNavigation } from '../../context/NavigationContext';

export default function Header({
  isCollapsed,
  onToggleCollapse,
  onOpenMobileMenu
}) {
  const { theme, toggleTheme, THEMES: themes } = useTheme();
  const { breadcrumbs, currentRouteMeta } = useNavigation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const mockNotifications = [
    {
      id: 1,
      title: 'Prompt Injection Blocked',
      desc: 'Pattern [JAILBREAK_ATTEMPT_DAN] intercepted in Gateway',
      time: '2m ago',
      level: 'critical'
    },
    {
      id: 2,
      title: 'Approval Required',
      desc: 'High-risk query flagged with confidential financial schema',
      time: '14m ago',
      level: 'warning'
    },
    {
      id: 3,
      title: 'Kafka Stream Rebalanced',
      desc: 'Dead letter queue consumer healthy on partition 0',
      time: '45m ago',
      level: 'info'
    }
  ];

  return (
    <header className="app-header">
      {/* Left Section: Mobile Toggle & Breadcrumbs */}
      <div className="header-left">
        {/* Mobile Hamburger Button */}
        <button
          className="header-btn mobile-toggle-btn"
          onClick={onOpenMobileMenu}
          aria-label="Open mobile navigation menu"
          id="btn-mobile-menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        {/* Desktop Collapse Toggle */}
        <button
          className="header-btn desktop-collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand sidebar (Ctrl+\\)" : "Collapse sidebar (Ctrl+\\)"}
          id="btn-desktop-collapse"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isCollapsed ? (
              <polyline points="13 17 18 12 13 7"></polyline>
            ) : (
              <polyline points="11 17 6 12 11 7"></polyline>
            )}
            <line x1="18" y1="19" x2="18" y2="5"></line>
          </svg>
        </button>

        {/* Breadcrumb Trail */}
        <nav className="breadcrumbs" aria-label="Breadcrumbs">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={index}>
                {index > 0 && <span className="breadcrumb-separator">/</span>}
                {isLast ? (
                  <span className="breadcrumb-item active">{crumb.label}</span>
                ) : crumb.href ? (
                  <a href={crumb.href} className="breadcrumb-item">{crumb.label}</a>
                ) : (
                  <span className="breadcrumb-item text-dim">{crumb.label}</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Center Section: Quick Search Command Bar */}
      <div className="header-center">
        <div className="search-bar-wrapper">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search prompts, violations, rules, audit logs... (Press '/' to focus)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <kbd className="search-shortcut">⌘K</kbd>
        </div>
      </div>

      {/* Right Section: Theme Toggle, Status, Notifications, Profile */}
      <div className="header-right">
        {/* Gateway Health Chip */}
        <div className="status-chip" title="AI Gateway 8080 Active">
          <span className="pulse-dot online"></span>
          <span className="status-chip-text">GATEWAY ONLINE</span>
        </div>

        {/* Theme Switcher Button */}
        <button
          className="header-btn theme-toggle-btn"
          onClick={toggleTheme}
          title={`Active Theme: ${theme.toUpperCase()} (Click to toggle)`}
          id="btn-toggle-theme"
        >
          {(!theme || theme === themes.SAFFRON) && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" fill="#D4760A" stroke="#D4760A"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
          {theme === themes.DARK && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
          {theme === themes.MIDNIGHT && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
          {theme === themes.LIGHT && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2"></path>
              <path d="M12 20v2"></path>
              <path d="m4.93 4.93 1.41 1.41"></path>
              <path d="m17.66 17.66 1.41 1.41"></path>
              <path d="M2 12h2"></path>
              <path d="M20 12h2"></path>
              <path d="m6.34 17.66-1.41 1.41"></path>
              <path d="m19.07 4.93-1.41 1.41"></path>
            </svg>
          )}
          <span className="theme-name">{theme}</span>
        </button>

        {/* Notifications Center */}
        <div className="relative-container">
          <button
            className={`header-btn notification-btn ${showNotifications ? 'active' : ''}`}
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            title="Security Notifications"
            id="btn-notifications"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span className="notification-badge">3</span>
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="dropdown-panel notifications-panel">
              <div className="dropdown-header">
                <span className="dropdown-title">Security Incidents</span>
                <span className="badge badge-critical">3 Active</span>
              </div>
              <div className="dropdown-body">
                {mockNotifications.map(n => (
                  <div key={n.id} className="notification-item">
                    <div className={`notification-indicator indicator-${n.level}`}></div>
                    <div className="notification-content">
                      <div className="notification-title">{n.title}</div>
                      <div className="notification-desc">{n.desc}</div>
                      <div className="notification-time">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="dropdown-footer">
                <a href="#/audit" onClick={() => setShowNotifications(false)}>View all audit events →</a>
              </div>
            </div>
          )}
        </div>

        {/* User Identity Chip */}
        <div className="relative-container">
          <button
            className="user-profile-button"
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            id="btn-user-profile"
          >
            <div className="user-avatar">SA</div>
            <div className="user-meta">
              <span className="user-name">SecOps Lead</span>
              <span className="user-role">CHIEF ARCHITECT</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="dropdown-panel profile-panel">
              <div className="profile-card-header">
                <div className="user-avatar large">SA</div>
                <div>
                  <div className="profile-full-name">SecOps Administrator</div>
                  <div className="profile-email">admin@enterprise.ai</div>
                  <span className="badge badge-cyan mt-1">SECURITY_ADMIN</span>
                </div>
              </div>
              <div className="dropdown-divider"></div>
              <div className="profile-menu-links">
                <a href="#/settings" className="profile-link" onClick={() => setShowProfileMenu(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  Gateway Security Policies
                </a>
                <a href="#/compliance" className="profile-link" onClick={() => setShowProfileMenu(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  Compliance Certificates
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
