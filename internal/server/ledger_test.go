package server

import (
	"testing"

	"guardrail/internal/budget"
	"guardrail/internal/config"
)

func TestLimitsForAppliesKeyOverride(t *testing.T) {
	l := ledgerAdapter{
		limits:    budget.Limits{PerKeyDailyUSD: 10, PerKeyDailyTok: 1000, SoftNudge: true},
		overrides: map[string]config.KeyBudget{"emp-intern": {DailyTokens: 50}},
	}
	got := l.limitsFor("emp-intern")
	if got.PerKeyDailyTok != 50 || got.PerKeyDailyUSD != 10 || !got.SoftNudge {
		t.Fatalf("override limits = %+v", got)
	}
	if got := l.limitsFor("emp-alice"); got.PerKeyDailyTok != 1000 {
		t.Fatalf("default limits = %+v", got)
	}
}
