package com.kora.reports;

import java.util.List;

/**
 * A report's content, independent of the file format.
 *
 * @param title e.g. "Project status report", already translated
 * @param subject what it is about, e.g. "AKG-MB · Mobile banking app"; also used in the file name
 * @param sections in reading order
 */
public record ReportContent(String title, String subject, List<ReportSection> sections) {

    public ReportContent {
        sections = List.copyOf(sections);
    }
}
