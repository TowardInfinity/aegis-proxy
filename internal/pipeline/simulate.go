package pipeline

import (
	"context"
	"fmt"
	"strings"
	"time"

	"guardrail/internal/audit"
	"guardrail/internal/dlp"
	"guardrail/internal/security"
)

// SimJudge is the judge's answer for one playground run. It is nil when the
// judge was not called.
type SimJudge struct {
	TriggeredBy string  `json:"triggered_by"`
	Escalate    bool    `json:"escalate"`
	Category    string  `json:"category,omitempty"`
	Reason      string  `json:"reason,omitempty"`
	MS          float64 `json:"ms"`
}

// SimResult is the request-side outcome for one message. Decision is
// pass, redact, block, or escalate. Block wins over escalate, which wins
// over redact.
type SimResult struct {
	Decision       string            `json:"decision"`
	RedactedText   string            `json:"redacted_text"`
	Hits           []RuleHit         `json:"hits"`
	InjectionScore float64           `json:"injection_score"`
	Judge          *SimJudge         `json:"judge"`
	Trace          []audit.TraceStep `json:"trace"`
}

// Simulate runs the request-side checks on one user message: the injection
// detector, DLP through a throwaway vault, and the judge when a trigger
// matches. It can call the judge, which costs money. It does not touch the
// upstream, the cache, the ledger, the audit log, or the held queue.
func (o *Orchestrator) Simulate(ctx context.Context, text string) SimResult {
	r := &run{
		req:   &Request{Messages: []Message{{Role: "user", Content: text}}, Shape: ShapeChat},
		dec:   Decision{Action: ActionPass, Stage: StageValidate},
		start: time.Now(),
	}
	v := o.simValidate(r, text)
	if v.Block {
		return r.simResult("block", "", v.Score, nil)
	}
	redacted := o.simRedact(r, text)
	decision := "pass"
	if redacted != text {
		decision = "redact"
	}
	judge, blocked, escalated := o.simJudge(ctx, r, redacted)
	if blocked {
		decision = "block"
	} else if escalated {
		decision = "escalate"
	}
	return r.simResult(decision, redacted, v.Score, judge)
}

func (o *Orchestrator) simValidate(r *run, text string) security.Verdict {
	start := time.Now()
	v := security.ScanRequest(o.detector, text, o.cfg.Thresholds, o.cfg.Monitor)
	r.dec.RuleHits = append(r.dec.RuleHits, toRuleHitsSecurity(v.Hits)...)
	best := 0.0
	for _, h := range v.Hits {
		if h.Score >= 0.5 && h.Score > best {
			best, r.grey = h.Score, h.Rule
		}
	}
	if v.Block {
		r.step(StageValidate, "block", validateDetail(v), start)
		return v
	}
	r.step(StageValidate, "pass", "ok", start)
	return v
}

// simRedact tokenizes with a vault this call owns. The shared vault is what
// live requests restore from, and a playground run must not add to it.
func (o *Orchestrator) simRedact(r *run, text string) string {
	start := time.Now()
	if !o.cfg.Redact || len(o.cfg.Detectors) == 0 {
		r.step(StageRedact, "skip", "off", start)
		return text
	}
	vault := dlp.NewVault(time.Hour, 32)
	red := &dlp.Redactor{Detectors: o.cfg.Detectors, Vault: vault}
	out, _, hits := red.Redact(text)
	before := len(r.dec.RuleHits)
	r.dec.RuleHits = append(r.dec.RuleHits, toRuleHits(hits)...)
	outcome, detail := redactDetail(r.dec.RuleHits[before:])
	r.step(StageRedact, outcome, detail, start)
	return out
}

// simJudge returns the verdict, whether policy blocked, and whether the judge
// escalated. It never records a hold.
func (o *Orchestrator) simJudge(ctx context.Context, r *run, text string) (*SimJudge, bool, bool) {
	start := time.Now()
	if o.cfg.Judge == nil {
		r.step(StageJudge, "skip", "off", start)
		return nil, false, false
	}
	if strings.TrimSpace(text) == "" {
		r.step(StageJudge, "skip", "not triggered", start)
		return nil, false, false
	}
	trigger := o.judgeTrigger(r, text)
	if trigger == "" {
		r.step(StageJudge, "skip", "not triggered", start)
		return nil, false, false
	}
	call := time.Now()
	v, err := o.cfg.Judge.Judge(ctx, text)
	ms := float64(time.Since(call)) / float64(time.Millisecond)
	judge := &SimJudge{TriggeredBy: triggerQuote(trigger), MS: ms}
	if err != nil {
		r.step(StageJudge, "error", "unavailable", start)
		return judge, o.cfg.JudgeFailClosed, false
	}
	judge.Escalate = v.Escalate
	judge.Category = v.Category
	judge.Reason = v.Reason
	if !v.Escalate {
		r.step(StageJudge, "pass", fmt.Sprintf("trigger %q → allow", triggerQuote(trigger)), start)
		return judge, false, false
	}
	detail := fmt.Sprintf("trigger %q → escalate", triggerQuote(trigger))
	if v.Category != "" {
		detail = fmt.Sprintf("trigger %q → escalate (%s)", triggerQuote(trigger), v.Category)
	}
	r.step(StageJudge, "block", detail, start)
	return judge, false, true
}

func (r *run) simResult(decision, redacted string, score float64, judge *SimJudge) SimResult {
	hits := r.dec.RuleHits
	if hits == nil {
		hits = []RuleHit{}
	}
	trace := append([]audit.TraceStep(nil), r.trace...)
	if trace == nil {
		trace = []audit.TraceStep{}
	}
	return SimResult{
		Decision:       decision,
		RedactedText:   redacted,
		Hits:           hits,
		InjectionScore: score,
		Judge:          judge,
		Trace:          trace,
	}
}
