package pipeline

import (
	"fmt"
	"strings"
	"time"

	"guardrail/internal/audit"
	"guardrail/internal/security"
)

// DailyTokenBudget is optional. Ledgers that implement it let the budget
// stage say "used/cap tokens today" without pipeline importing budget.
// A ceiling of 0 means that dimension is unlimited.
type DailyTokenBudget interface {
	DailyTokens(key string) (ceiling, used int)
}

func (r *run) step(stage, outcome, detail string, start time.Time) {
	r.stepBetween(stage, outcome, detail, start, time.Now())
}

func (r *run) stepBetween(stage, outcome, detail string, start, end time.Time) {
	ms := float64(end.Sub(start)) / float64(time.Millisecond)
	if ms < 0 {
		ms = 0
	}
	r.trace = append(r.trace, audit.TraceStep{Stage: stage, Outcome: outcome, MS: ms, Detail: detail})
}

func redactDetail(hits []RuleHit) (outcome, detail string) {
	if len(hits) == 0 {
		return "pass", "nothing to tokenize"
	}
	counts := map[string]int{}
	var order []string
	n := 0
	for _, h := range hits {
		if counts[h.Rule] == 0 {
			order = append(order, h.Rule)
		}
		counts[h.Rule]++
		n++
	}
	parts := make([]string, len(order))
	for i, rule := range order {
		if counts[rule] == 1 {
			parts[i] = rule
		} else {
			parts[i] = fmt.Sprintf("%s ×%d", rule, counts[rule])
		}
	}
	return "redact", fmt.Sprintf("%d values tokenized: %s", n, strings.Join(parts, ", "))
}

func validateDetail(v security.Verdict) string {
	rule := v.Family
	best := -1.0
	for _, h := range v.Hits {
		if h.Score > best {
			best = h.Score
			rule = h.Rule
		}
	}
	family := v.Family
	if family == "" {
		family = "injection"
	}
	return fmt.Sprintf("%s score %.2f (%s)", family, v.Score, rule)
}

func triggerQuote(trigger string) string {
	if name, ok := strings.CutPrefix(trigger, "keyword:"); ok {
		return name
	}
	if name, ok := strings.CutPrefix(trigger, "grey:"); ok {
		return name
	}
	return trigger
}

func judgeEscalateDetail(trigger string, e Held) string {
	if e.Category != "" {
		return fmt.Sprintf("trigger %q → escalate %s (%s)", triggerQuote(trigger), e.Ticket, e.Category)
	}
	return fmt.Sprintf("trigger %q → escalate %s", triggerQuote(trigger), e.Ticket)
}

func upstreamDetail(model string, status, tokens int, cost float64, streamed bool) string {
	d := fmt.Sprintf("%s %d, %d tokens, $%.5f", model, status, tokens, cost)
	if streamed {
		d += ", streamed"
	}
	return d
}

func (o *Orchestrator) budgetDetail(r *run) string {
	tb, ok := o.ledger.(DailyTokenBudget)
	if !ok {
		return "ok"
	}
	ceiling, used := tb.DailyTokens(r.req.Key)
	if ceiling <= 0 {
		return "unlimited"
	}
	return fmt.Sprintf("%d/%d tokens today", used, ceiling)
}

func scanBlockDetail(hits []RuleHit) string {
	for i := len(hits) - 1; i >= 0; i-- {
		if hits[i].Rule == "output_injection" {
			return "injection flagged"
		}
	}
	return "1 credential flagged"
}
