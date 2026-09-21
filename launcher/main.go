// Native launcher avoids Windows .cmd execution and keeps ordinary desktop use unchanged.
package main

import (
 "encoding/json"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
)
func main() {
 self, err := os.Executable(); if err != nil { os.Exit(1) }
 root := filepath.Dir(self)
 var config struct { Node string `json:"node"` }
 data, err := os.ReadFile(filepath.Join(root,"runtime","desktop","install.json"))
 if err != nil || json.Unmarshal(data,&config) != nil || config.Node == "" { fmt.Fprintln(os.Stderr,"JevPilot installation is incomplete. Run setup from the plugin."); os.Exit(1) }
 args := os.Args[1:]
 script := filepath.Join(root,"runtime","desktop","bootstrap.mjs")
 if len(args)>0 { switch args[0] { case "doctor","setup","enable","disable","report","call","dashboard": script=filepath.Join(root,"scripts","cli.mjs") } }
 command := exec.Command(config.Node,append([]string{script},args...)...)
 command.Stdin=os.Stdin; command.Stdout=os.Stdout; command.Stderr=os.Stderr
 if err=command.Run(); err!=nil { if exit,ok:=err.(*exec.ExitError);ok { os.Exit(exit.ExitCode()) }; fmt.Fprintln(os.Stderr,"JevPilot runtime could not start"); os.Exit(1) }
}
