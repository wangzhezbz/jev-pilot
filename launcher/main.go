// Native launcher avoids Windows .cmd execution and keeps ordinary desktop use unchanged.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	self, err := os.Executable()
	if err != nil {
		os.Exit(1)
	}
	root := filepath.Dir(self)
	var config struct {
		Node    string            `json:"node"`
		RealBin string            `json:"realBin"`
		SHA256  map[string]string `json:"sha256"`
	}
	data, err := os.ReadFile(filepath.Join(root, "runtime", "desktop", "install.json"))
	if err != nil || json.Unmarshal(data, &config) != nil {
		fmt.Fprintln(os.Stderr, "JevPilot installation is incomplete. Run setup from the plugin.")
		os.Exit(1)
	}
	args := os.Args[1:]
	script := filepath.Join(root, "runtime", "desktop", "bootstrap.mjs")
	if len(args) > 0 {
		switch args[0] {
		case "doctor", "setup", "enable", "disable", "report", "call", "dashboard":
			script = filepath.Join(root, "scripts", "cli.mjs")
		}
	}
	valid := len(config.SHA256) > 0
	if _, err := exec.LookPath(config.Node); err != nil {
		valid = false
	}
	for name, expected := range config.SHA256 {
		data, err := os.ReadFile(filepath.Join(root, "runtime", "desktop", name))
		if err != nil {
			valid = false
			break
		}
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != expected {
			valid = false
			break
		}
	}
	command := exec.Command(config.Node, append([]string{script}, args...)...)
	fallback := !valid && script == filepath.Join(root, "runtime", "desktop", "bootstrap.mjs") && config.RealBin != ""
	if fallback {
		command = exec.Command(config.RealBin, args...)
	}
	for _, value := range os.Environ() {
		if !strings.HasPrefix(value, "CODEX_CLI_PATH=") && (!fallback || !strings.HasPrefix(value, "TYPESAFE_API_KEY=")) {
			command.Env = append(command.Env, value)
		}
	}
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err = command.Run(); err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			os.Exit(exit.ExitCode())
		}
		fmt.Fprintln(os.Stderr, "JevPilot runtime could not start")
		os.Exit(1)
	}
}
