package claudetool

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"shelley.exe.dev/llm"
)

// DeploySelfTool deploys the current Shelley build to the exe.dev VM.
// It forks a daemon process that waits for Shelley to exit, then copies
// the binary and restarts the service.
type DeploySelfTool struct{}

const deploySelfInputSchema = `{
	"type": "object",
	"properties": {
		"source_binary": {
			"type": "string",
			"description": "Path to the built binary to deploy (e.g., /home/exedev/shelley/bin/shelley-linux)"
		}
	},
	"required": ["source_binary"]
}`

func (t *DeploySelfTool) Tool() *llm.Tool {
	return &llm.Tool{
		Name:        "deploy_self",
		Description: "Deploy a new Shelley build to the exe.dev VM. This will stop the current Shelley service, copy the new binary, and restart the service. The source binary must already be built (e.g., via 'make build-linux'). The connection will be lost during deployment.",
		InputSchema: llm.MustSchema(deploySelfInputSchema),
		Run:         t.run,
	}
}

type deploySelfParams struct {
	SourceBinary string `json:"source_binary"`
}

func (t *DeploySelfTool) run(ctx context.Context, input json.RawMessage) llm.ToolOut {
	var params deploySelfParams
	if err := json.Unmarshal(input, &params); err != nil {
		return llm.ToolOut{Error: fmt.Errorf("failed to parse params: %v", err)}
	}

	if params.SourceBinary == "" {
		return llm.ToolOut{Error: fmt.Errorf("source_binary is required")}
	}

	// Verify source binary exists
	if _, err := os.Stat(params.SourceBinary); err != nil {
		return llm.ToolOut{Error: fmt.Errorf("source binary not found: %v", err)}
	}

	// Fork the deploy daemon using the NEW binary (not the running one)
	// This avoids UI staleness checks failing on the old binary
	// Use systemd-cat to send output to journald (viewable with: journalctl -t shelley-deploy)
	cmd := exec.Command("systemd-cat", "--identifier=shelley-deploy", params.SourceBinary, "deploy-daemon", params.SourceBinary)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true, // Create new session, detach from parent
	}

	if err := cmd.Start(); err != nil {
		return llm.ToolOut{Error: fmt.Errorf("failed to start deploy daemon: %v", err)}
	}

	msg := fmt.Sprintf("Deploy daemon started (PID %d). It will stop the service, copy %s to /usr/local/bin/shelley, and restart the service. The connection will be lost during deployment.", cmd.Process.Pid, params.SourceBinary)
	return llm.ToolOut{LLMContent: llm.TextContent(msg)}
}
