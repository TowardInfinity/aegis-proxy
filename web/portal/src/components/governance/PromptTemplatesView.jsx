import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';

export default function PromptTemplatesView() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    templateKey: '',
    title: '',
    category: 'CUSTOMER_SERVICE',
    systemPrompt: '',
    userPromptTemplate: '',
    tags: 'support, triage, enterprise',
    version: 1,
    approved: true,
    isFavorite: false
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    const data = await GovernanceApi.getTemplates();
    setTemplates(data);
    setLoading(false);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggleFavorite = async (tmpl) => {
    const updated = await GovernanceApi.toggleFavoriteTemplate(tmpl.id);
    if (updated) {
      setTemplates(prev => prev.map(t => t.id === tmpl.id ? updated : t));
      showToast(updated.isFavorite ? `Added "${tmpl.title}" to favorites` : `Removed "${tmpl.title}" from favorites`);
    }
  };

  const handleOpenCreate = () => {
    setFormData({
      templateKey: `TMPL-${Math.floor(100 + Math.random() * 900)}`,
      title: '',
      category: 'CUSTOMER_SERVICE',
      systemPrompt: 'You are an enterprise AI assistant adhering to all corporate data privacy boundaries.',
      userPromptTemplate: 'Please review {input_document} and formulate a summary adhering to {guidelines}.',
      tags: 'summary, assistant',
      version: 1,
      approved: true,
      isFavorite: false
    });
    setEditingTemplate('NEW');
  };

  const handleOpenEdit = (t) => {
    setFormData({ ...t });
    setEditingTemplate(t);
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    const saved = await GovernanceApi.saveTemplate(formData);
    if (saved) {
      showToast(`Prompt template "${saved.title}" saved successfully (v${saved.version})`);
      setEditingTemplate(null);
      loadTemplates();
    }
  };

  const handleExportAll = () => {
    const jsonStr = JSON.stringify(templates, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enterprise-prompt-templates-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Exported all prompt templates to JSON');
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(importJsonText);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        await GovernanceApi.saveTemplate(item);
      }
      showToast(`Successfully imported ${items.length} templates`);
      setImportModalOpen(false);
      setImportJsonText('');
      loadTemplates();
    } catch (err) {
      alert('Invalid JSON input: ' + err.message);
    }
  };

  const categories = ['ALL', 'CUSTOMER_SERVICE', 'ENGINEERING', 'FINANCE', 'LEGAL', 'MARKETING'];

  const filtered = templates.filter(t => {
    const matchCat = selectedCategory === 'ALL' || t.category === selectedCategory;
    const matchFav = !showFavoritesOnly || t.isFavorite;
    const matchSearch = (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.templateKey || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.tags || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchFav && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '48px',
          right: '28px',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          border: '1px solid var(--border-highlight)',
          boxShadow: 'var(--shadow-glow-cyan)',
          padding: '12px 20px',
          borderRadius: '10px',
          fontSize: '0.82rem',
          fontWeight: 600,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ color: 'var(--accent-cyan)' }}>●</span>
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 28px',
        background: 'var(--bg-glass-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-highlight)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
              color: '#0f172a',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '6px'
            }}>TEMPLATE REPOSITORY</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Standardized, Approved & Parameterized Prompts
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Prompt Template Management
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setImportModalOpen(true)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ↓ Import
          </button>
          <button
            onClick={handleExportAll}
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ↑ Export
          </button>
          <button
            onClick={handleOpenCreate}
            id="btn-create-template"
            style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
              color: '#0f172a',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: 'var(--shadow-glow-cyan)'
            }}
          >
            <span>+</span> Create Template
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        background: 'var(--bg-glass-card)',
        padding: '14px 20px',
        borderRadius: '12px',
        border: '1px solid var(--border-glass)'
      }}>
        {/* Categories & Favorites Toggle */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: selectedCategory === cat ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.04)',
                color: selectedCategory === cat ? '#0f172a' : 'var(--text-secondary)',
                border: selectedCategory === cat ? 'none' : '1px solid var(--border-glass)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {cat}
            </button>
          ))}

          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            style={{
              background: showFavoritesOnly ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)',
              color: showFavoritesOnly ? '#fbbf24' : 'var(--text-secondary)',
              border: `1px solid ${showFavoritesOnly ? '#fbbf24' : 'var(--border-glass)'}`,
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginLeft: '8px'
            }}
          >
            ★ Favorites Only
          </button>
        </div>

        {/* Search */}
        <div style={{ minWidth: '260px' }}>
          <input
            type="text"
            placeholder="Search templates, tags, variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '8px 14px',
              color: '#f8fafc',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading Prompt Templates...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No prompt templates found.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '20px'
        }}>
          {filtered.map(tmpl => {
            const vars = tmpl.extractedVariables ? tmpl.extractedVariables.split(',').filter(Boolean) : [];
            const tagsList = tmpl.tags ? tmpl.tags.split(',').map(s => s.trim()).filter(Boolean) : [];

            return (
              <div
                key={tmpl.id}
                style={{
                  background: 'var(--bg-glass-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--border-glass)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  boxShadow: 'var(--shadow-card)'
                }}
              >
                <div>
                  {/* Top Bar with Favorite Star & Key */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => handleToggleFavorite(tmpl)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1.2rem',
                          color: tmpl.isFavorite ? '#fbbf24' : '#64748b',
                          padding: 0
                        }}
                        title={tmpl.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
                      >
                        ★
                      </button>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        {tmpl.templateKey}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: 'rgba(255,255,255,0.06)',
                        color: '#94a3b8'
                      }}>
                        v{tmpl.version || 1}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: tmpl.approved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: tmpl.approved ? '#34d399' : '#fbbf24'
                      }}>
                        {tmpl.approved ? 'APPROVED' : 'PENDING'}
                      </span>
                    </div>
                  </div>

                  <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: '#f8fafc', fontWeight: 700 }}>
                    {tmpl.title}
                  </h3>

                  {/* System Prompt & Template Box */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '0.78rem',
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                    marginBottom: '10px',
                    maxHeight: '100px',
                    overflowY: 'auto'
                  }}>
                    {tmpl.userPromptTemplate}
                  </div>

                  {/* Variables Identified */}
                  {vars.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Variables:</span>
                      {vars.map(v => (
                        <span
                          key={v}
                          style={{
                            background: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                            borderRadius: '4px',
                            padding: '1px 6px',
                            fontSize: '0.72rem',
                            fontFamily: 'monospace'
                          }}
                        >
                          {`{${v.trim()}}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {tagsList.map(tag => (
                      <span
                        key={tag}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          color: '#64748b',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '0.68rem'
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer with Usage Count & Edit */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--border-glass)',
                  paddingTop: '12px'
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Usage count: <strong style={{ color: 'var(--accent-cyan)' }}>{tmpl.usageCount || 0}</strong>
                  </span>

                  <button
                    onClick={() => handleOpenEdit(tmpl)}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid var(--border-glass)',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Edit Template
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Template Modal */}
      {editingTemplate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-glass-card)',
            border: '1px solid var(--border-highlight)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                {editingTemplate === 'NEW' ? 'Create Reusable Prompt Template' : `Edit Template: ${formData.templateKey}`}
              </h2>
              <button
                onClick={() => setEditingTemplate(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    TEMPLATE KEY
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.templateKey}
                    onChange={(e) => setFormData({ ...formData, templateKey: e.target.value })}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    CATEGORY
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: '0.82rem'
                    }}
                  >
                    <option value="CUSTOMER_SERVICE">CUSTOMER_SERVICE</option>
                    <option value="ENGINEERING">ENGINEERING</option>
                    <option value="FINANCE">FINANCE</option>
                    <option value="LEGAL">LEGAL</option>
                    <option value="MARKETING">MARKETING</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  TEMPLATE TITLE
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Incident Summarizer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  SYSTEM PROMPT INSTRUCTION
                </label>
                <textarea
                  rows="2"
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  USER PROMPT TEMPLATE (Use &#123;variable_name&#125; for substitutions)
                </label>
                <textarea
                  rows="4"
                  required
                  value={formData.userPromptTemplate}
                  onChange={(e) => setFormData({ ...formData, userPromptTemplate: e.target.value })}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    background: '#090d16',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#38bdf8',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  TAGS (Comma-Separated)
                </label>
                <input
                  type="text"
                  placeholder="support, triage, tier1"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-glass-card)',
            border: '1px solid var(--border-highlight)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: 'var(--shadow-card)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '1.15rem' }}>
              Import Prompt Templates
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Paste a JSON array of template definitions to batch import into the enterprise governance repository.
            </p>
            <form onSubmit={handleImportSubmit}>
              <textarea
                rows="8"
                required
                placeholder='[ { "templateKey": "TMPL-NEW", "title": "...", "userPromptTemplate": "..." } ]'
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  background: '#090d16',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: '#38bdf8',
                  fontSize: '0.8rem',
                  marginBottom: '16px'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--accent-cyan)',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
