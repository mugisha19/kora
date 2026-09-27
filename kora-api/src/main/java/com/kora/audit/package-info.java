/**
 * Reading the audit trail (feature 19) and the project activity feed built from it (feature 18). Entries are written
 * by {@code platform.audit}, in the transaction of every change; this module only reads and verifies them.
 */
@ApplicationModule(displayName = "Audit")
package com.kora.audit;

import org.springframework.modulith.ApplicationModule;
