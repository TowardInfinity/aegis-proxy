package audit

import (
	"database/sql"
	"time"
)

// Point is one minute of the audit log. Zero counts are kept so a chart can
// show a quiet minute instead of closing the gap.
type Point struct {
	T        int64   `json:"t"`
	Pass     int     `json:"pass"`
	Redact   int     `json:"redact"`
	Block    int     `json:"block"`
	CacheHit int     `json:"cache_hit"`
	USD      float64 `json:"usd"`
}

// Series is the /timeseries payload. T is unix seconds, aligned to the minute.
type Series struct {
	BucketSec int     `json:"bucket_sec"`
	Points    []Point `json:"points"`
}

// Timeseries buckets the audit table into minute counts ending at the current
// minute. minutes below 1 selects the default hour; the cap is one day so a
// dashboard poll cannot ask the table for an unbounded scan.
func Timeseries(db *sql.DB, minutes int, now time.Time) (Series, error) {
	minutes = clampMinutes(minutes)
	const bucket int64 = 60
	end := now.Unix() / bucket * bucket
	start := end - int64(minutes-1)*bucket
	out := Series{BucketSec: int(bucket), Points: make([]Point, minutes)}
	for i := range out.Points {
		out.Points[i].T = start + int64(i)*bucket
	}
	// COUNT stays an integer. SUM of cost is the only real; it includes every
	// action in the minute, including blocks, so spend is not dropped.
	rows, err := db.Query(`SELECT (ts / 60) * 60,
			COUNT(CASE WHEN action = 'pass' THEN 1 END),
			COUNT(CASE WHEN action = 'redact' THEN 1 END),
			COUNT(CASE WHEN action = 'block' THEN 1 END),
			COUNT(CASE WHEN action = 'cache_hit' THEN 1 END),
			COALESCE(SUM(cost_usd), 0)
		FROM audit
		WHERE ts >= ? AND ts < ?
		GROUP BY (ts / 60) * 60`, start, end+bucket)
	if err != nil {
		return Series{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var b int64
		var pass, redact, block, cache int
		var usd float64
		if err := rows.Scan(&b, &pass, &redact, &block, &cache, &usd); err != nil {
			return Series{}, err
		}
		i := int((b - start) / bucket)
		if i < 0 || i >= len(out.Points) {
			continue
		}
		out.Points[i].Pass = pass
		out.Points[i].Redact = redact
		out.Points[i].Block = block
		out.Points[i].CacheHit = cache
		out.Points[i].USD = usd
	}
	if err := rows.Err(); err != nil {
		return Series{}, err
	}
	return out, nil
}

func clampMinutes(minutes int) int {
	if minutes < 1 {
		return 60
	}
	if minutes > 1440 {
		return 1440
	}
	return minutes
}
