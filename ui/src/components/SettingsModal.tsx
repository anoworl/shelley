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

// Local storage keys for client-side settings
const MONACO_DIFF_KEY = "shelley-use-monaco-diff";

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Client-side settings (localStorage)
  const [useMonacoDiff, setUseMonacoDiff] = useState(() => {
    try {
      return localStorage.getItem(MONACO_DIFF_KEY) === "true";
    } catch {
      return false;
    }
  });

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
      // Save client-side settings to localStorage
      try {
        if (useMonacoDiff) {
          localStorage.setItem(MONACO_DIFF_KEY, "true");
        } else {
          localStorage.removeItem(MONACO_DIFF_KEY);
        }
      } catch {
        // Ignore localStorage errors
      }
      
      await api.updateSettings(settings);
      // Notify all ChatInterface instances to reload settings
      window.dispatchEvent(new CustomEvent("shelley-settings-changed"));
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
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" className="settings-modal">
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

            <div className="settings-row">
              <label className="settings-label">Enter Key Behavior</label>
              <select
                className="settings-select"
                value={settings.ui?.enterBehavior ?? "send"}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    ui: { ...prev.ui, enterBehavior: e.target.value as "send" | "stop_and_send" },
                  }))
                }
              >
                <option value="send">Send (wait for agent to finish)</option>
                <option value="stop_and_send">Stop & Send (interrupt and send immediately)</option>
              </select>
            </div>
            <p className="settings-field-description">
              Controls what happens when you press Enter while the agent is working.
            </p>

            <div className="settings-row">
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={useMonacoDiff}
                  onChange={(e) => setUseMonacoDiff(e.target.checked)}
                />
                <span>Use Monaco Diff View</span>
              </label>
            </div>
            <p className="settings-field-description">
              Use Monaco editor for side-by-side diff view in patch tool. Requires page reload to take effect.
            </p>
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
