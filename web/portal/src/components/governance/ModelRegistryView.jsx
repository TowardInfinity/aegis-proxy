import React, { useState, useEffect } from 'react';
import { GovernanceApi } from '../../services/governanceApi';

export default function ModelRegistryView() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState('ALL');
  const [editingModel, setEditingModel] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [formData, setFormData] = useState({
    modelName: '',
    vendor: 'OpenAI',
    version: '1.0',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiType: 'OPENAI_COMPATIBLE',
    supportedFeatures: 'STREAMING,FUNCTION_CALLING,VISION',
    costPer1kInput: 0.002,
    costPer1kOutput: 0.008,
    contextWindow: 128000,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Platform AI Team',
    healthStatus: 'HEALTHY',
    enabled: true
  });

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setLoading(true);
    const data = await GovernanceApi.getModels();
    setModels(data);
    setLoading(false);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggle = async (model) => {
    const updated = await GovernanceApi.toggleModel(model.id, !model.enabled);
    if (updated) {
      setModels(prev => prev.map(m => m.id === model.id ? updated : m));
      showToast(`Model ${model.modelName} ${updated.enabled ? 'Enabled & Approved' : 'Disabled / Suspended'}`);
    }
  };

  const handleOpenRegister = () => {
    setFormData({
      modelName: '',
      vendor: 'OpenAI',
      version: '1.0',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiType: 'OPENAI_COMPATIBLE',
      supportedFeatures: 'STREAMING,FUNCTION_CALLING,VISION',
      costPer1kInput: 0.003,
      costPer1kOutput: 0.012,
      contextWindow: 128000,
      streamingSupport: true,
      status: 'APPROVED',
      owner: 'SecOps Team',
      healthStatus: 'HEALTHY',
      enabled: true
    });
    setEditingModel('NEW');
  };

  const handleOpenEdit = (m) => {
    setFormData({ ...m });
    setEditingModel(m);
  };

  const handleSaveModel = async (e) => {
    e.preventDefault();
    const saved = await GovernanceApi.saveModel(formData);
    if (saved) {
      showToast(`Model ${saved.modelName} successfully registered/updated`);
      setEditingModel(null);
      loadModels();
    }
  };

  const vendors = ['ALL', 'OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral', 'Internal Models'];

  const filtered = models.filter(m => {
    if (selectedVendor === 'ALL') return true;
    return (m.vendor || '').toLowerCase().includes(selectedVendor.toLowerCase());
  });

  const getVendorBadgeColor = (vendor) => {
    switch (vendor) {
      case 'OpenAI': return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
      case 'Anthropic': return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'Google': return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
      case 'Meta': return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      case 'Mistral': return { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' };
      default: return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Toast Notification */}
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
            }}>MODEL INVENTORY</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Enterprise Approved LLMs & Health Registry
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            Enterprise Model Registry
          </h1>
        </div>

        <button
          onClick={handleOpenRegister}
          id="btn-register-model"
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
          <span>+</span> Register Model
        </button>
      </div>

      {/* Vendor Filter Bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        background: 'var(--bg-glass-card)',
        padding: '14px 20px',
        borderRadius: '12px',
        border: '1px solid var(--border-glass)'
      }}>
        {vendors.map(v => (
          <button
            key={v}
            onClick={() => setSelectedVendor(v)}
            style={{
              background: selectedVendor === v ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.04)',
              color: selectedVendor === v ? '#0f172a' : 'var(--text-secondary)',
              border: selectedVendor === v ? 'none' : '1px solid var(--border-glass)',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Model Cards Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading Model Registry...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No models found for {selectedVendor}.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '20px'
        }}>
          {filtered.map(model => {
            const vStyle = getVendorBadgeColor(model.vendor);
            return (
              <div
                key={model.id}
                style={{
                  background: 'var(--bg-glass-card)',
                  borderRadius: '14px',
                  border: `1px solid ${model.enabled ? 'var(--border-glass)' : 'rgba(239, 68, 68, 0.3)'}`,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: 'var(--shadow-card)',
                  opacity: model.enabled ? 1 : 0.7
                }}
              >
                <div>
                  {/* Top card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: vStyle.bg,
                        color: vStyle.text,
                        border: `1px solid ${vStyle.border}`
                      }}>
                        {model.vendor}
                      </span>
                      <h3 style={{ margin: '8px 0 2px 0', fontSize: '1.2rem', color: '#f8fafc', fontWeight: 700 }}>
                        {model.modelName}
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        Version: {model.version || 'latest'} • {model.apiType}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: model.healthStatus === 'HEALTHY' ? '#34d399' : '#f87171'
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: model.healthStatus === 'HEALTHY' ? '#34d399' : '#f87171'
                        }}></span>
                        {model.healthStatus || 'HEALTHY'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        Owner: {model.owner || 'AI Platform'}
                      </span>
                    </div>
                  </div>

                  {/* Specs & Pricing */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    margin: '14px 0',
                    background: 'rgba(0,0,0,0.25)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Context Window</span>
                      <strong style={{ color: '#f8fafc' }}>
                        {model.contextWindow ? `${(model.contextWindow / 1000).toFixed(0)}k tokens` : '128k tokens'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Streaming Support</span>
                      <strong style={{ color: model.streamingSupport ? '#34d399' : '#f87171' }}>
                        {model.streamingSupport ? 'Enabled (SSE)' : 'Disabled'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Input Pricing</span>
                      <strong style={{ color: '#38bdf8' }}>
                        ${model.costPer1kInput ? model.costPer1kInput.toFixed(4) : '0.0020'} / 1k
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Output Pricing</span>
                      <strong style={{ color: '#38bdf8' }}>
                        ${model.costPer1kOutput ? model.costPer1kOutput.toFixed(4) : '0.0080'} / 1k
                      </strong>
                    </div>
                  </div>

                  {/* Endpoint & Features */}
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    <div style={{ marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#64748b' }}>Endpoint: </span>
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{model.endpoint}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Features: </span>
                      <span style={{ color: '#cbd5e1' }}>{model.supportedFeatures || 'TEXT_GEN, EMBEDDINGS'}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--border-glass)',
                  paddingTop: '14px',
                  marginTop: '4px'
                }}>
                  <button
                    onClick={() => handleToggle(model)}
                    style={{
                      background: model.enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: model.enabled ? '#34d399' : '#f87171',
                      border: `1px solid ${model.enabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {model.enabled ? '● ACTIVE' : '○ DISABLED'}
                  </button>

                  <button
                    onClick={() => handleOpenEdit(model)}
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
                    Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register/Edit Model Modal */}
      {editingModel && (
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
                {editingModel === 'NEW' ? 'Register New LLM Endpoint' : `Configure Model: ${formData.modelName}`}
              </h2>
              <button
                onClick={() => setEditingModel(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModel} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    MODEL NAME / ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                    value={formData.modelName}
                    onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
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
                    VENDOR
                  </label>
                  <select
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
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
                    <option value="OpenAI">OpenAI</option>
                    <option value="Anthropic">Anthropic</option>
                    <option value="Google">Google</option>
                    <option value="Meta">Meta</option>
                    <option value="Mistral">Mistral</option>
                    <option value="Internal Models">Internal Models</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  API ENDPOINT URL
                </label>
                <input
                  type="text"
                  required
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    API TYPE
                  </label>
                  <select
                    value={formData.apiType}
                    onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
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
                    <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE</option>
                    <option value="ANTHROPIC_MESSAGES">ANTHROPIC_MESSAGES</option>
                    <option value="GOOGLE_GENAI">GOOGLE_GENAI</option>
                    <option value="OLLAMA_REST">OLLAMA_REST</option>
                    <option value="HUGGINGFACE_TGI">HUGGINGFACE_TGI</option>
                    <option value="INTERNAL_GATEWAY">INTERNAL_GATEWAY</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    CONTEXT WINDOW (Tokens)
                  </label>
                  <input
                    type="number"
                    value={formData.contextWindow}
                    onChange={(e) => setFormData({ ...formData, contextWindow: parseInt(e.target.value) || 32000 })}
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    COST PER 1K INPUT ($)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.costPer1kInput}
                    onChange={(e) => setFormData({ ...formData, costPer1kInput: parseFloat(e.target.value) || 0 })}
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
                    COST PER 1K OUTPUT ($)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.costPer1kOutput}
                    onChange={(e) => setFormData({ ...formData, costPer1kOutput: parseFloat(e.target.value) || 0 })}
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  SUPPORTED FEATURES (Comma-Separated)
                </label>
                <input
                  type="text"
                  placeholder="STREAMING,FUNCTION_CALLING,VISION,JSON_MODE"
                  value={formData.supportedFeatures}
                  onChange={(e) => setFormData({ ...formData, supportedFeatures: e.target.value })}
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
                  onClick={() => setEditingModel(null)}
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
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
