import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { Settings, GuardianCheckSettings } from "../types";
import { api } from "../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultCheckSettings: GuardianCheckSettings = {
  enabled: false,
  model: "claude-haiku-4-5-20251001",
  prompt: "",
};

// Get available models from server init data
const getAvailableModels = () => {
  const models = window.__SHELLEY_INIT__?.models ?? [];
  return models.filter((m) => m.ready).map((m) => ({ id: m.id, name: m.id }));
};

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings(settings);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateStreamSettings = (updates: Partial<GuardianCheckSettings>) => {
    setSettings((prev) => ({
      ...prev,
      guardian: {
        ...prev.guardian,
        stream: {
          ...(prev.guardian?.stream ?? defaultCheckSettings),
          ...updates,
        },
      },
    }));
  };

  const updateToolCheckSettings = (updates: Partial<GuardianCheckSettings>) => {
    setSettings((prev) => ({
      ...prev,
      guardian: {
        ...prev.guardian,
        toolCheck: {
          ...(prev.guardian?.toolCheck ?? defaultCheckSettings),
          ...updates,
        },
      },
    }));
  };

  const streamSettings = settings.guardian?.stream ?? defaultCheckSettings;
  const toolCheckSettings = settings.guardian?.toolCheck ?? defaultCheckSettings;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      {loading ? (
        <div className="settings-loading">Loading...</div>
      ) : (
        <div className="settings-content">
          {error && <div className="settings-error">{error}</div>}

          <div className="settings-section">
            <h3 className="settings-section-title">Display</h3>
            <div className="settings-row">
              <label className="settings-label">Tool Indicator Mode</label>
              <select
                className="settings-select"
                value={settings.ui?.indicatorMode ?? "inline"}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    ui: { ...prev.ui, indicatorMode: e.target.value as "inline" | "block" | "hidden" },
                  }))
                }
              >
                <option value="inline">Inline (compact, merge paragraphs)</option>
                <option value="block">Block (indicators on separate lines)</option>
                <option value="hidden">Hidden (no indicators)</option>
              </select>
            </div>
            <p className="settings-field-description">
              Controls how tool execution indicators are displayed when tools are collapsed.
            </p>

            {settings.ui?.indicatorMode === "inline" && (
              <>
                <div className="settings-row">
                  <label className="settings-label">Expansion Behavior</label>
                  <select
                    className="settings-select"
                    value={settings.ui?.expansionBehavior ?? "single"}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        ui: { ...prev.ui, expansionBehavior: e.target.value as "single" | "all" },
                      }))
                    }
                  >
                    <option value="single">Single (expand only clicked indicator)</option>
                    <option value="all">All (expand all indicators in message)</option>
                  </select>
                </div>
                <p className="settings-field-description">
                  Controls whether clicking an indicator expands just that one or all indicators in the message.
                </p>
              </>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Guardian AI</h3>
            <p className="settings-section-description">
              Guardian AI monitors the agent's behavior and can stop it when it goes off track.
            </p>

            {/* Stream Monitoring */}
            <div className="settings-subsection">
              <div className="settings-row">
                <label className="settings-checkbox-label">
                  <input
                    type="checkbox"
                    checked={streamSettings.enabled}
                    onChange={(e) => updateStreamSettings({ enabled: e.target.checked })}
                  />
                  <span>Stream Monitoring</span>
                </label>
              </div>
              <p className="settings-field-description">
                Monitors the agent's output stream in real-time.
              </p>

              {streamSettings.enabled && (
                <>
                  <div className="settings-row">
                    <label className="settings-label">Model</label>
                    <select
                      className="settings-select"
                      value={streamSettings.model}
                      onChange={(e) => updateStreamSettings({ model: e.target.value })}
                    >
                      {getAvailableModels().map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="settings-row">
                    <label className="settings-label">Prompt</label>
                    <textarea
                      className="settings-textarea"
                      value={streamSettings.prompt}
                      onChange={(e) => updateStreamSettings({ prompt: e.target.value })}
                      placeholder="Instructions for when to stop the agent..."
                      rows={4}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Tool Check */}
            <div className="settings-subsection">
              <div className="settings-row">
                <label className="settings-checkbox-label">
                  <input
                    type="checkbox"
                    checked={toolCheckSettings.enabled}
                    onChange={(e) => updateToolCheckSettings({ enabled: e.target.checked })}
                  />
                  <span>Tool Execution Check</span>
                </label>
              </div>
              <p className="settings-field-description">
                Reviews tool calls before execution.
              </p>

              {toolCheckSettings.enabled && (
                <>
                  <div className="settings-row">
                    <label className="settings-label">Model</label>
                    <select
                      className="settings-select"
                      value={toolCheckSettings.model}
                      onChange={(e) => updateToolCheckSettings({ model: e.target.value })}
                    >
                      {getAvailableModels().map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="settings-row">
                    <label className="settings-label">Prompt</label>
                    <textarea
                      className="settings-textarea"
                      value={toolCheckSettings.prompt}
                      onChange={(e) => updateToolCheckSettings({ prompt: e.target.value })}
                      placeholder="Instructions for reviewing tool calls..."
                      rows={4}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="settings-actions">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default SettingsModal;
