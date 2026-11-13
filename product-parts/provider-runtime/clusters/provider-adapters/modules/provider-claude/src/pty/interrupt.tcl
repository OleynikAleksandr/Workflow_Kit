# Long-lived Node screen classifier, shared with ConPTY. No screen/transcript goes to disk.
set interrupt_pipe ""
set parameter_busy 0
set parameter_action 0
if {[info exists env(WFK_PTY_NODE)]} {
  set interrupt_node $env(WFK_PTY_NODE)
  unset env(WFK_PTY_NODE)
  set native_host ""
  if {[info exists env(WFK_NATIVE_HOST_ID)]} { set native_host $env(WFK_NATIVE_HOST_ID); unset env(WFK_NATIVE_HOST_ID) }
  set worker [file join [file dirname [info script]] interrupt-worker.ts]
  catch {
    set interrupt_pipe [open [list | $interrupt_node $worker $debug $native_host $dir] r+]
    fconfigure $interrupt_pipe -encoding utf-8 -buffering line
  }
}
proc interrupt_exchange {line} {
  global interrupt_pipe parameter_busy parameter_action
  if {$interrupt_pipe eq ""} { return 0 }
  set escape 0
  if {$line eq "POLL"} { set parameter_busy 0; set parameter_action 0 }
  if {[catch {
    puts $interrupt_pipe $line
    flush $interrupt_pipe
    while {[gets $interrupt_pipe answer] >= 0} {
      if {$answer eq "BUSY"} { set parameter_busy 1 }
      if {$answer eq "PARAM"} { set parameter_action 1 }
      if {[string match "WRITE *" $answer]} { send -- [encoding convertfrom utf-8 [binary format H* [string range $answer 6 end]]] }
      if {$answer eq "ESC"} { set escape 1 }
      if {$answer eq "FAILED"} { set escape 0 }
      if {$answer eq "DONE"} { break }
    }
  }]} { set escape 0; catch {close $interrupt_pipe}; set interrupt_pipe "" }
  return $escape
}
proc interrupt_data {data} {
  binary scan [encoding convertto utf-8 $data] H* encoded
  interrupt_exchange "DATA $encoded"
}
proc interrupt_tick {} {
  global spawn_id expect_out parameter_action parameter_busy
  set escape [interrupt_exchange POLL]
  if {!$escape && !$parameter_action} { return }
  # A dialog may have arrived while the helper read the request. Drain again immediately before Esc.
  set changed 0
  expect -timeout 0 {
    -re {(?s).+} { interrupt_data $expect_out(buffer); set changed 1; exp_continue -continue_timer }
    eof { set changed 1 }
    timeout {}
  }
  if {$changed} { interrupt_exchange CANCEL } elseif {$parameter_action} {
    interrupt_exchange COMMIT
  } else {
    if {[catch {send -- "\033"}]} { interrupt_exchange CANCEL }
  }
}
