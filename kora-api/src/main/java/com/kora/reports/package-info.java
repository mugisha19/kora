/**
 * Report exports (feature 21): PDF for reading and Excel for analysis, generated in the background as the requester,
 * stored in object storage and announced by a notification.
 *
 * <p>This package is the module's API: the modules that own the data implement {@link com.kora.reports.ReportSource}
 * for their report types and describe the content with the format-neutral model ({@link
 * com.kora.reports.ReportContent}); the exporters in this module turn it into a file.
 */
@ApplicationModule(displayName = "Reports")
package com.kora.reports;

import org.springframework.modulith.ApplicationModule;
