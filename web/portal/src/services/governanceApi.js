/**
 * Enterprise AI Guardian - AI Governance API Client
 * Dual-mode client with live REST calls and stateful fallback simulation.
 */

const BASE_URL = '/api/v1/governance';

// In-memory fallback state for standalone / offline operations
let fallbackPolicies = [
  {
    id: 1,
    policyKey: 'POL-SEC-001',
    name: 'Prompt Injection & Jailbreak Defense',
    category: 'SECURITY',
    description: 'Blocks all jailbreak patterns, system prompt overrides, and adversarial evasion vectors',
    priority: 1,
    status: 'ACTIVE',
    rulesJson: '{"keywords":["ignore previous instructions","jailbreak","system prompt","DAN mode"],"action":"BLOCK"}',
    action: 'BLOCK',
    approvalRequired: false,
    enabled: true,
    version: 3,
    updatedAt: '2026-10-25T14:20:00',
    updatedBy: 'secops-lead'
  },
  {
    id: 2,
    policyKey: 'POL-FIN-001',
    name: 'Pre-Release Earnings & Forecast Firewall',
    category: 'FINANCIAL',
    description: 'Escalates prompts discussing unannounced earnings, salary tables, or financial forecasts to Finance Director',
    priority: 5,
    status: 'ACTIVE',
    rulesJson: '{"keywords":["earnings","quarterly","forecast","revenue","salary"],"action":"REVIEW"}',
    action: 'REVIEW',
    approvalRequired: true,
    enabled: true,
    version: 2,
    updatedAt: '2026-10-24T09:15:00',
    updatedBy: 'cfo-office'
  },
  {
    id: 3,
    policyKey: 'POL-PRIV-001',
    name: 'Customer PII & Cardholder Data Redaction',
    category: 'DATA_PRIVACY',
    description: 'Auto-redacts SSNs, credit card numbers, and banking details before prompt ingress',
    priority: 10,
    status: 'ACTIVE',
    rulesJson: '{"keywords":["ssn","social security","credit card","passport"],"action":"REDACT"}',
    action: 'REDACT',
    approvalRequired: false,
    enabled: true,
    version: 1,
    updatedAt: '2026-10-20T11:00:00',
    updatedBy: 'compliance-officer'
  },
  {
    id: 4,
    policyKey: 'POL-CODE-001',
    name: 'Private Key & Infrastructure Credential Shield',
    category: 'CODE_INTEGRITY',
    description: 'Blocks transmission of private cryptographic keys, AWS secrets, and database connection strings',
    priority: 2,
    status: 'ACTIVE',
    rulesJson: '{"keywords":["private_key","aws_secret","api_key","password"],"action":"BLOCK"}',
    action: 'BLOCK',
    approvalRequired: false,
    enabled: true,
    version: 1,
    updatedAt: '2026-10-22T16:45:00',
    updatedBy: 'devsecops'
  }
];

let fallbackModels = [
  {
    id: 1,
    modelName: 'gpt-4o',
    vendor: 'OpenAI',
    version: '2024-08-06',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiType: 'OPENAI_COMPATIBLE',
    supportedFeatures: 'STREAMING,FUNCTION_CALLING,VISION,JSON_MODE',
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.0100,
    contextWindow: 128000,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Platform AI Team',
    healthStatus: 'HEALTHY',
    enabled: true
  },
  {
    id: 2,
    modelName: 'claude-3-5-sonnet',
    vendor: 'Anthropic',
    version: '20241022',
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiType: 'ANTHROPIC_MESSAGES',
    supportedFeatures: 'STREAMING,VISION,CODE_EXECUTION',
    costPer1kInput: 0.0030,
    costPer1kOutput: 0.0150,
    contextWindow: 200000,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Platform AI Team',
    healthStatus: 'HEALTHY',
    enabled: true
  },
  {
    id: 3,
    modelName: 'gemini-1.5-pro',
    vendor: 'Google',
    version: '002',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiType: 'GEMINI_NATIVE',
    supportedFeatures: 'STREAMING,AUDIO,VIDEO,1M_CONTEXT',
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.0050,
    contextWindow: 1000000,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Research CoE',
    healthStatus: 'HEALTHY',
    enabled: true
  },
  {
    id: 4,
    modelName: 'llama-3-70b',
    vendor: 'Meta',
    version: 'Instruct-v1',
    endpoint: 'http://vllm-cluster.internal:8000/v1/completions',
    apiType: 'OPENAI_COMPATIBLE',
    supportedFeatures: 'STREAMING,SELF_HOSTED,ZERO_EGRESS',
    costPer1kInput: 0.0006,
    costPer1kOutput: 0.0018,
    contextWindow: 8192,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Infra Engineering',
    healthStatus: 'HEALTHY',
    enabled: true
  },
  {
    id: 5,
    modelName: 'mistral-large',
    vendor: 'Mistral',
    version: '2407',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    apiType: 'OPENAI_COMPATIBLE',
    supportedFeatures: 'STREAMING,FUNCTION_CALLING,JSON_MODE',
    costPer1kInput: 0.0020,
    costPer1kOutput: 0.0060,
    contextWindow: 128000,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Platform AI Team',
    healthStatus: 'HEALTHY',
    enabled: true
  },
  {
    id: 6,
    modelName: 'internal-coder-v2',
    vendor: 'Internal Models',
    version: 'v2.1',
    endpoint: 'http://internal-models.corp.local:8080/generate',
    apiType: 'OPENAI_COMPATIBLE',
    supportedFeatures: 'STREAMING,AIR_GAPPED',
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0002,
    contextWindow: 32000,
    streamingSupport: true,
    status: 'APPROVED',
    owner: 'Data Science CoE',
    healthStatus: 'HEALTHY',
    enabled: true
  }
];

let fallbackTemplates = [
  {
    id: 1,
    templateKey: 'TMPL-FIN-001',
    title: 'Executive Quarterly Financial Digest',
    category: 'FINANCE',
    description: 'Standard prompt for synthesizing SEC filings and quarterly balance sheets',
    content: 'Act as a chartered financial analyst. Review {financial_data} for {period} and formulate a risk summary highlighting EBITDA, operating cash flow, and debt-to-equity ratio.',
    variables: 'financial_data,period',
    version: 1,
    approvalStatus: 'APPROVED',
    tags: 'finance,earnings,ebitda,compliance',
    isFavorite: true,
    usageCount: 1420,
    author: 'cfo-office'
  },
  {
    id: 2,
    templateKey: 'TMPL-ENG-001',
    title: 'Secure Architecture & Code Review',
    category: 'ENGINEERING',
    description: 'Evaluates code snippets against OWASP Top 10 vulnerabilities and concurrency bottlenecks',
    content: 'Perform a static application security audit of {code_snippet} in {language}. Flag OWASP vulnerabilities, injection vectors, and suggest modernized remediation.',
    variables: 'code_snippet,language',
    version: 2,
    approvalStatus: 'APPROVED',
    tags: 'engineering,owasp,security,code-review',
    isFavorite: true,
    usageCount: 4890,
    author: 'secops-lead'
  },
  {
    id: 3,
    templateKey: 'TMPL-LEG-001',
    title: 'Vendor NDA & Master Services Agreement Analysis',
    category: 'LEGAL',
    description: 'Extracts liability caps, indemnification, and IP ownership clauses from commercial contracts',
    content: 'Analyze the legal contract excerpt: {contract_text}. Identify governing law, limitation of liability cap, data processing commitments, and mutual indemnification terms.',
    variables: 'contract_text',
    version: 1,
    approvalStatus: 'APPROVED',
    tags: 'legal,contracts,nda,msa',
    isFavorite: false,
    usageCount: 820,
    author: 'legal-counsel'
  }
];

let fallbackDepartments = [
  {
    id: 1,
    departmentName: 'Engineering',
    departmentCode: 'ENG',
    dailyTokenLimit: 15000000,
    monthlyCostLimitUsd: 8000.0,
    currentMonthlySpendUsd: 3120.40,
    allowedModels: 'gpt-4o,claude-3-5-sonnet,llama-3-70b,internal-coder-v2',
    blockedModels: 'uncensored-v1',
    allowedPromptCategories: 'CODE,ARCHITECTURE,DOCUMENTATION,GENERAL',
    restrictedCategories: 'PAYROLL,PATIENT_HEALTH',
    businessHoursOnly: false,
    emergencyOverrideActive: false
  },
  {
    id: 2,
    departmentName: 'Finance',
    departmentCode: 'FIN',
    dailyTokenLimit: 5000000,
    monthlyCostLimitUsd: 3500.0,
    currentMonthlySpendUsd: 1840.60,
    allowedModels: 'gpt-4o,claude-3-5-sonnet,gemini-1.5-pro',
    blockedModels: 'llama-3-8b,uncensored-v1',
    allowedPromptCategories: 'FINANCE,SPREADSHEET,EXECUTIVE,GENERAL',
    restrictedCategories: 'SOURCE_CODE,PATIENT_HEALTH',
    businessHoursOnly: true,
    businessHoursStart: '08:00',
    businessHoursEnd: '19:00',
    emergencyOverrideActive: false
  },
  {
    id: 3,
    departmentName: 'Legal',
    departmentCode: 'LEG',
    dailyTokenLimit: 4000000,
    monthlyCostLimitUsd: 3000.0,
    currentMonthlySpendUsd: 1150.00,
    allowedModels: 'claude-3-5-sonnet,gpt-4o,gemini-1.5-pro',
    blockedModels: 'uncensored-v1',
    allowedPromptCategories: 'LEGAL,CONTRACTS,COMPLIANCE,REGULATORY',
    restrictedCategories: 'SOURCE_CODE',
    businessHoursOnly: false,
    emergencyOverrideActive: false
  }
];

let fallbackUsers = [
  {
    id: 1,
    userId: 'dev.lead@enterprise.ai',
    userRole: 'ENGINEER',
    department: 'Engineering',
    customDailyTokenLimit: 2000000,
    isRestricted: false,
    canBypassReview: false
  },
  {
    id: 2,
    userId: 'cfo.analyst@enterprise.ai',
    userRole: 'ANALYST',
    department: 'Finance',
    customDailyTokenLimit: 500000,
    isRestricted: false,
    canBypassReview: false
  },
  {
    id: 3,
    userId: 'contractor.external@enterprise.ai',
    userRole: 'CONTRACTOR',
    department: 'Engineering',
    customDailyTokenLimit: 100000,
    isRestricted: false,
    restrictionReason: 'External contractor: full oversight gating required',
    canBypassReview: false
  }
];

let fallbackApprovalPolicies = [
  {
    id: 1,
    policyKey: 'APPR-HIGH-RISK',
    name: 'High Risk Escalation Workflow',
    triggerCategory: 'HIGH_RISK',
    workflowType: 'ESCALATION',
    primaryApproverRole: 'SECURITY_LEAD',
    escalationApproverRole: 'CISO',
    autoExpiryHours: 24,
    description: 'Triggers dual-tier escalation to CISO if prompt risk score exceeds 75',
    enabled: true
  },
  {
    id: 2,
    policyKey: 'APPR-FIN-01',
    name: 'Corporate Financial & Earnings Review',
    triggerCategory: 'FINANCE',
    workflowType: 'MULTI_LEVEL',
    primaryApproverRole: 'FINANCE_DIRECTOR',
    escalationApproverRole: 'CFO',
    autoExpiryHours: 12,
    description: 'Mandatory multi-level approval for material non-public financial calculations',
    enabled: true
  },
  {
    id: 3,
    policyKey: 'APPR-LEG-01',
    name: 'Legal & Regulatory Review',
    triggerCategory: 'LEGAL',
    workflowType: 'SINGLE_APPROVAL',
    primaryApproverRole: 'LEGAL_COUNSEL',
    autoExpiryHours: 48,
    description: 'Sign-off for contractual queries covered under customer NDAs',
    enabled: true
  },
  {
    id: 4,
    policyKey: 'APPR-SEC-01',
    name: 'Critical Secrets Review',
    triggerCategory: 'CRITICAL_SECRETS',
    workflowType: 'PARALLEL',
    primaryApproverRole: 'SECURITY_LEAD',
    escalationApproverRole: 'DEVOPS_LEAD',
    autoExpiryHours: 6,
    description: 'Parallel security and infrastructure verification when token leak is suspected',
    enabled: true
  }
];

let fallbackHistory = [
  {
    id: 1,
    policyKey: 'POL-SEC-001',
    version: 3,
    actionType: 'UPDATE',
    changedBy: 'secops-lead',
    changedAt: '2026-10-25T14:20:00',
    changeSummary: 'Added DAN mode keyword and bumped priority to 1'
  },
  {
    id: 2,
    policyKey: 'POL-FIN-001',
    version: 2,
    actionType: 'UPDATE',
    changedBy: 'cfo-office',
    changedAt: '2026-10-24T09:15:00',
    changeSummary: 'Enforced mandatory approval requirement'
  },
  {
    id: 3,
    policyKey: 'POL-PRIV-001',
    version: 1,
    actionType: 'CREATE',
    changedBy: 'compliance-officer',
    changedAt: '2026-10-20T11:00:00',
    changeSummary: 'Created initial policy version'
  }
];

export const GovernanceApi = {
  // Overview
  async getOverview() {
    try {
      const res = await fetch(`${BASE_URL}/overview`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return {
      totalPolicies: fallbackPolicies.length,
      activePolicies: fallbackPolicies.filter(p => p.enabled).length,
      totalModels: fallbackModels.length,
      approvedModels: fallbackModels.filter(m => m.enabled).length,
      totalPromptTemplates: fallbackTemplates.length,
      totalDepartments: fallbackDepartments.length,
      totalGovernedUsers: fallbackUsers.length,
      totalApprovalWorkflows: fallbackApprovalPolicies.length,
      totalMonthlyBudgetCeilingUsd: 14500.0,
      currentMonthlySpendUsd: 6111.0,
      budgetUtilizationPercent: 42.1,
      recentAuditHistory: fallbackHistory,
      policiesByCategory: { SECURITY: 2, FINANCIAL: 1, DATA_PRIVACY: 1 },
      modelsByVendor: { OpenAI: 1, Anthropic: 1, Google: 1, Meta: 1, Mistral: 1, 'Internal Models': 1 }
    };
  },

  // Policies
  async getPolicies() {
    try {
      const res = await fetch(`${BASE_URL}/policies`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackPolicies];
  },

  async savePolicy(policy) {
    try {
      const url = policy.id ? `${BASE_URL}/policies/${policy.id}` : `${BASE_URL}/policies`;
      const method = policy.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    // Fallback simulation
    if (policy.id) {
      fallbackPolicies = fallbackPolicies.map(p => p.id === policy.id ? { ...p, ...policy, version: (p.version || 1) + 1, updatedAt: new Date().toISOString() } : p);
      return fallbackPolicies.find(p => p.id === policy.id);
    } else {
      const newP = { ...policy, id: Date.now(), version: 1, updatedAt: new Date().toISOString() };
      fallbackPolicies.push(newP);
      return newP;
    }
  },

  async togglePolicy(id, enabled) {
    try {
      const res = await fetch(`${BASE_URL}/policies/${id}/status?enabled=${enabled}`, { method: 'PATCH' });
      if (res.ok) return await res.json();
    } catch (e) {}
    fallbackPolicies = fallbackPolicies.map(p => p.id === id ? { ...p, enabled, status: enabled ? 'ACTIVE' : 'SUSPENDED' } : p);
    return fallbackPolicies.find(p => p.id === id);
  },

  async rollbackPolicy(id, targetVersion) {
    try {
      const res = await fetch(`${BASE_URL}/policies/${id}/rollback?targetVersion=${targetVersion}`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}
    fallbackPolicies = fallbackPolicies.map(p => p.id === id ? { ...p, version: (p.version || 1) + 1, updatedAt: new Date().toISOString() } : p);
    return fallbackPolicies.find(p => p.id === id);
  },

  // Models
  async getModels() {
    try {
      const res = await fetch(`${BASE_URL}/models`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackModels];
  },

  async saveModel(model) {
    try {
      const url = model.id ? `${BASE_URL}/models/${model.id}` : `${BASE_URL}/models`;
      const method = model.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model)
      });
      if (res.ok) return await res.json();
    } catch (e) {}
    if (model.id) {
      fallbackModels = fallbackModels.map(m => m.id === model.id ? { ...m, ...model } : m);
      return fallbackModels.find(m => m.id === model.id);
    } else {
      const newM = { ...model, id: Date.now() };
      fallbackModels.push(newM);
      return newM;
    }
  },

  async toggleModel(id, enabled) {
    try {
      const res = await fetch(`${BASE_URL}/models/${id}/status?enabled=${enabled}`, { method: 'PATCH' });
      if (res.ok) return await res.json();
    } catch (e) {}
    fallbackModels = fallbackModels.map(m => m.id === id ? { ...m, enabled, status: enabled ? 'APPROVED' : 'RESTRICTED' } : p);
    return fallbackModels.find(m => m.id === id);
  },

  // Prompt Templates
  async getTemplates() {
    try {
      const res = await fetch(`${BASE_URL}/templates`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackTemplates];
  },

  async saveTemplate(tmpl) {
    try {
      const url = tmpl.id ? `${BASE_URL}/templates/${tmpl.id}` : `${BASE_URL}/templates`;
      const method = tmpl.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tmpl)
      });
      if (res.ok) return await res.json();
    } catch (e) {}
    if (tmpl.id) {
      fallbackTemplates = fallbackTemplates.map(t => t.id === tmpl.id ? { ...t, ...tmpl, version: (t.version || 1) + 1 } : t);
      return fallbackTemplates.find(t => t.id === tmpl.id);
    } else {
      const newT = { ...tmpl, id: Date.now(), version: 1, usageCount: 0 };
      fallbackTemplates.push(newT);
      return newT;
    }
  },

  async toggleFavoriteTemplate(id) {
    try {
      const res = await fetch(`${BASE_URL}/templates/${id}/favorite`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}
    fallbackTemplates = fallbackTemplates.map(t => t.id === id ? { ...t, isFavorite: !t.isFavorite } : t);
    return fallbackTemplates.find(t => t.id === id);
  },

  // Departments
  async getDepartments() {
    try {
      const res = await fetch(`${BASE_URL}/departments`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackDepartments];
  },

  async saveDepartment(dept) {
    try {
      const res = await fetch(`${BASE_URL}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dept)
      });
      if (res.ok) return await res.json();
    } catch (e) {}
    if (dept.id) {
      fallbackDepartments = fallbackDepartments.map(d => d.id === dept.id ? { ...d, ...dept } : d);
      return fallbackDepartments.find(d => d.id === dept.id);
    } else {
      const newD = { ...dept, id: Date.now() };
      fallbackDepartments.push(newD);
      return newD;
    }
  },

  async toggleEmergencyOverride(id, active, reason) {
    try {
      const res = await fetch(`${BASE_URL}/departments/${id}/emergency-override?active=${active}&reason=${encodeURIComponent(reason || '')}`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}
    fallbackDepartments = fallbackDepartments.map(d => d.id === id ? { ...d, emergencyOverrideActive: active, emergencyOverrideReason: active ? reason : null } : d);
    return fallbackDepartments.find(d => d.id === id);
  },

  // Users
  async getUsers() {
    try {
      const res = await fetch(`${BASE_URL}/users`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackUsers];
  },

  async saveUser(user) {
    try {
      const res = await fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (res.ok) return await res.json();
    } catch (e) {}
    if (user.id) {
      fallbackUsers = fallbackUsers.map(u => u.id === user.id ? { ...u, ...user } : u);
      return fallbackUsers.find(u => u.id === user.id);
    } else {
      const newU = { ...user, id: Date.now() };
      fallbackUsers.push(newU);
      return newU;
    }
  },

  async toggleUserRestriction(id, restricted, reason) {
    try {
      const res = await fetch(`${BASE_URL}/users/${id}/restrict?restricted=${restricted}&reason=${encodeURIComponent(reason || '')}`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}
    fallbackUsers = fallbackUsers.map(u => u.id === id ? { ...u, isRestricted: restricted, restrictionReason: restricted ? reason : null } : u);
    return fallbackUsers.find(u => u.id === id);
  },

  // Approvals
  async getApprovalPolicies() {
    try {
      const res = await fetch(`${BASE_URL}/approvals`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackApprovalPolicies];
  },

  async saveApprovalPolicy(policy) {
    try {
      const res = await fetch(`${BASE_URL}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy)
      });
      if (res.ok) return await res.json();
    } catch (e) {}
    if (policy.id) {
      fallbackApprovalPolicies = fallbackApprovalPolicies.map(p => p.id === policy.id ? { ...p, ...policy } : p);
      return fallbackApprovalPolicies.find(p => p.id === policy.id);
    } else {
      const newP = { ...policy, id: Date.now() };
      fallbackApprovalPolicies.push(newP);
      return newP;
    }
  },

  // History
  async getPolicyHistory() {
    try {
      const res = await fetch(`${BASE_URL}/policies/history`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return [...fallbackHistory];
  },

  // Simulator
  async runSimulation(req) {
    try {
      const res = await fetch(`${BASE_URL}/simulator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    // Client fallback simulation
    const pLower = (req.prompt || '').toLowerCase();
    let decision = 'ALLOW';
    let risk = 20;
    const triggered = [];
    const blocked = [];
    let approval = false;
    let workflow = 'Standard Non-Gated Fastpath';

    if (pLower.includes('ignore previous') || pLower.includes('jailbreak') || pLower.includes('dan mode')) {
      decision = 'BLOCK';
      risk = 95;
      triggered.push('Prompt Injection & Jailbreak Defense [POL-SEC-001] (BLOCK)');
      blocked.push('Triggered blocking policy: Prompt Injection & Jailbreak Defense');
    } else if (pLower.includes('earnings') || pLower.includes('forecast') || pLower.includes('revenue') || pLower.includes('salary')) {
      decision = 'REVIEW';
      risk = 65;
      approval = true;
      triggered.push('Pre-Release Earnings & Forecast Firewall [POL-FIN-001] (REVIEW)');
      blocked.push('Material unreleased corporate financial calculations detected');
      workflow = 'MULTI_LEVEL (Approver Role: FINANCE_DIRECTOR, Escalation: CFO, Auto-Expiry: 12h)';
    } else if (pLower.includes('private_key') || pLower.includes('aws_secret')) {
      decision = 'BLOCK';
      risk = 90;
      triggered.push('Private Key & Infrastructure Credential Shield [POL-CODE-001] (BLOCK)');
      blocked.push('Cryptographic secrets or infrastructure tokens detected');
    }

    if (req.model === 'uncensored-v1') {
      decision = 'BLOCK';
      risk = 85;
      blocked.push("Model 'uncensored-v1' is prohibited in department policy");
    }

    return {
      expectedDecision: decision,
      riskScore: risk,
      approvalNeeded: approval || decision === 'REVIEW',
      approvalWorkflowDetails: workflow,
      triggeredPolicies: triggered,
      blockedReasons: blocked,
      suggestedRemediations: decision === 'BLOCK' ? ['Remove adversarial keywords or prohibited credentials', 'Select an authorized model from registry'] : [],
      departmentQuotaStatus: 'PASSED',
      modelAuthorizationStatus: decision === 'BLOCK' && req.model === 'uncensored-v1' ? 'BLOCKED_BY_DEPARTMENT' : 'PERMITTED',
      latencyMs: 14
    };
  }
};
