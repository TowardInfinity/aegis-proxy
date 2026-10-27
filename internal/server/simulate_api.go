package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// simulateMax is the playground body cap. A SecOps paste is a message, not a file.
const simulateMax = 64 << 10

// handleSimulate answers POST /simulate. The call can reach the judge and
// therefore costs money. It never forwards the text to a model.
func (s *Server) handleSimulate(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > simulateMax {
		http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, simulateMax))
	if err != nil {
		var max *http.MaxBytesError
		if errors.As(err, &max) {
			http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	writeJSON(w, s.orch.Simulate(r.Context(), req.Text))
}
