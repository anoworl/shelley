package claudetool

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"shelley.exe.dev/llm"
)

// DeploySelfTool deploys the current Shelley build to the exe.dev VM.
// It runs `make install-binary` in the background, which handles stopping
// the service, copying the binary, and restarting.
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
		Description: "Deploy a new Shelley build to the exe.dev VM. This will stop the current Shelley service, copy the new binary, and restart the service. The source binary must already be built (e.g., via 'make build-linux'). The connection will be lost during deployment. IMPORTANT: After calling this tool, do NOT call any other tools. Immediately end your turn and tell the user that the service will restart shortly, and if assets have changed, the page will reload automatically.",
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

	// Find the project directory (parent of bin/)
	// source_binary is like /home/exedev/shelley-3/bin/shelley-linux
	projectDir := filepath.Dir(filepath.Dir(params.SourceBinary))

	// Verify Makefile exists
	makefilePath := filepath.Join(projectDir, "Makefile")
	if _, err := os.Stat(makefilePath); err != nil {
		return llm.ToolOut{Error: fmt.Errorf("Makefile not found in %s", projectDir)}
	}

	// Run `make install-binary SHELLEY_DEPLOY=1` in a new session.
	// Setsid creates a new session so the process survives when shelley dies.
	// SHELLEY_DEPLOY=1 tells make to wait 0.5s before stopping the socket,
	// allowing this response to be sent first.
	cmd := exec.Command("make", "-C", projectDir, "install-binary", "SHELLEY_DEPLOY=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	if err := cmd.Start(); err != nil {
		return llm.ToolOut{Error: fmt.Errorf("failed to start deploy: %v", err)}
	}

	msg := fmt.Sprintf("Deploy started. Running 'make install-binary' in %s. The service will restart shortly and the connection will be lost.", projectDir)
	return llm.ToolOut{LLMContent: llm.TextContent(msg)}
}
