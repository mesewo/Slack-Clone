//go:build !windows

package gateway

import (
	"os"
	"os/exec"
)

func configureProcess(cmd *exec.Cmd) {}

func gracefulStopProcess(process *os.Process) error {
	return process.Signal(os.Interrupt)
}
