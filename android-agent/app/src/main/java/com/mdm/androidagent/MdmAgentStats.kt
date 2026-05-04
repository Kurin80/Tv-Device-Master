package com.mdm.androidagent

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * In-process stats shared between MdmPollingService and MainActivity.
 *
 * Updated by the service, read by the UI. Thread-safe via atomic types.
 * Values reset when the process restarts (expected — the service repopulates them).
 */
object MdmAgentStats {
    /** Epoch-ms of the last successful heartbeat (0 = never). */
    val lastHeartbeatMs: AtomicLong = AtomicLong(0L)

    /** Total commands executed since process start. */
    val commandsExecuted: AtomicInteger = AtomicInteger(0)

    /** Description of the last command that was executed. */
    @Volatile
    var lastCommandDesc: String = "—"

    /** "success" or "error" for the last command result. */
    @Volatile
    var lastCommandStatus: String = "—"
}
