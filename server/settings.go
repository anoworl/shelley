package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"shelley.exe.dev/db"
	"shelley.exe.dev/db/generated"
)

// Settings represents the application settings stored as JSON
type Settings struct {
	Guardian *GuardianSettings `json:"guardian,omitempty"`
	UI       *UISettings       `json:"ui,omitempty"`
}

// UISettings contains UI-related settings
type UISettings struct {
	// IndicatorMode controls how tool indicators are displayed when tools are hidden
	// "inline" (default): show indicators inline with text, merge paragraphs
	// "block": show indicators but keep paragraphs separate (legacy behavior)
	// "hidden": don't show indicators
	IndicatorMode string `json:"indicatorMode,omitempty"`
	// ExpansionBehavior controls how inline indicators expand (only applies when IndicatorMode is "inline")
	// "single" (default): only expand the clicked indicator
	// "all": expand all indicators in the same message
	ExpansionBehavior string `json:"expansionBehavior,omitempty"`
	// EnterBehavior controls what happens when Enter is pressed while agent is working
	// "send" (default): normal send, button disabled while agent is working
	// "stop_and_send": automatically stop agent and send new message
	EnterBehavior string `json:"enterBehavior,omitempty"`
}

// GuardianSettings contains settings for the guardian AI
type GuardianSettings struct {
	Stream    *GuardianCheckSettings `json:"stream,omitempty"`
	ToolCheck *GuardianCheckSettings `json:"toolCheck,omitempty"`
}

// GuardianCheckSettings contains settings for a specific guardian check type
type GuardianCheckSettings struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model"`
	Prompt  string `json:"prompt"`
}

// DefaultSettings returns the default settings
func DefaultSettings() Settings {
	return Settings{
		Guardian: &GuardianSettings{
			Stream: &GuardianCheckSettings{
				Enabled: false,
				Model:   "claude-haiku-4-5-20251001",
				Prompt:  "",
			},
			ToolCheck: &GuardianCheckSettings{
				Enabled: false,
				Model:   "claude-haiku-4-5-20251001",
				Prompt:  "",
			},
		},
		UI: &UISettings{
			IndicatorMode:     "inline",
			ExpansionBehavior: "single",
			EnterBehavior:     "send",
		},
	}
}

// GetSettings retrieves the current settings from the database
func GetSettings(ctx context.Context, database *db.DB) (Settings, error) {
	var data string
	err := database.Queries(ctx, func(q *generated.Queries) error {
		var err error
		data, err = q.GetSettings(ctx)
		return err
	})
	if err != nil {
		return Settings{}, fmt.Errorf("failed to get settings: %w", err)
	}

	// Start with defaults and merge stored settings
	settings := DefaultSettings()
	if data != "" && data != "{}" {
		if err := json.Unmarshal([]byte(data), &settings); err != nil {
			return Settings{}, fmt.Errorf("failed to parse settings: %w", err)
		}
	}

	return settings, nil
}

// SaveSettings saves the settings to the database
func SaveSettings(ctx context.Context, database *db.DB, settings Settings) error {
	data, err := json.Marshal(settings)
	if err != nil {
		return fmt.Errorf("failed to serialize settings: %w", err)
	}

	err = database.QueriesTx(ctx, func(q *generated.Queries) error {
		return q.UpdateSettings(ctx, string(data))
	})
	if err != nil {
		return fmt.Errorf("failed to save settings: %w", err)
	}

	return nil
}

// handleSettings handles GET/POST /api/settings
func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		settings, err := GetSettings(r.Context(), s.db)
		if err != nil {
			s.logger.Error("failed to get settings", "error", err)
			http.Error(w, "failed to get settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(settings); err != nil {
			s.logger.Error("failed to encode settings", "error", err)
		}

	case http.MethodPost:
		var settings Settings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := SaveSettings(r.Context(), s.db, settings); err != nil {
			s.logger.Error("failed to save settings", "error", err)
			http.Error(w, "failed to save settings", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(settings); err != nil {
			s.logger.Error("failed to encode settings", "error", err)
		}

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
