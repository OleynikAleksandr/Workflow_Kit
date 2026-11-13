# Long-lived Node screen classifier, shared with ConPTY. No screen/transcript goes to disk.
set interrupt_pipe ""
if {[info exists env(WFK_PTY_NODE)]} {
  set interrupt_node $env(WFK_PTY_NODE)
  unset env(WFK_PTY_NODE)
  set worker [file join [file dirname [info script]] interrupt-worker.ts]
  catch {
    set interrupt_pipe [open [list | $interrupt_node $worker $debug] r+]
    fconfigure $interrupt_pipe -encoding utf-8 -buffering line
  }
}
proc interrupt_exchange {line} {
  global interrupt_pipe
  if {$interrupt_pipe eq ""} { return 0 }
  set escape 0
  if {[catch {
    puts $interrupt_pipe $line
    flush $interrupt_pipe
    while {[gets $interrupt_pipe answer] >= 0} {
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
  global spawn_id expect_out
  if {![interrupt_exchange POLL]} { return }
  # A dialog may have arrived while the helper read the request. Drain again immediately before Esc.
  set changed 0
  expect -timeout 0 {
    -re {(?s).+} { interrupt_data $expect_out(buffer); set changed 1; exp_continue -continue_timer }
    eof { set changed 1 }
    timeout {}
  }
  if {$changed} { interrupt_exchange CANCEL } else {
    if {[catch {send -- "\033"}]} { interrupt_exchange CANCEL }
  }
}
