package com.kora.reports.application;

import com.kora.reports.ReportLabels;
import com.kora.reports.ReportSection;
import com.kora.reports.ReportSection.Fact;
import java.util.List;

/**
 * What an exporter renders: the source's content plus what every report carries (who made it, when, for which
 * organization), and the labels for formatting in the requester's language.
 */
public record ReportDocument(
        String title, String subject, List<Fact> about, List<ReportSection> sections, ReportLabels labels) {

    public ReportDocument {
        about = List.copyOf(about);
        sections = List.copyOf(sections);
    }
}
