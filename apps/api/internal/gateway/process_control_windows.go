//go:build windows

package gateway

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

const (
	createNewProcessGroup = 0x00000200
	ctrlBreakEvent        = 1
)

var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	generateConsoleCtrlEvent = kernel32.NewProc("GenerateConsoleCtrlEvent")
)

func configureProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewProcessGroup}
}

func gracefulStopProcess(process *os.Process) error {
	if process == nil {
		return fmt.Errorf("process is nil")
	}
	result, _, callErr := generateConsoleCtrlEvent.Call(
		uintptr(ctrlBreakEvent),
		uintptr(process.Pid),
	)
	if result == 0 {
		return fmt.Errorf("GenerateConsoleCtrlEvent failed: %w", callErr)
	}
	return nil
}
