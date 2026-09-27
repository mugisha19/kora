package com.kora.reports;

import java.util.List;

/**
 * One part of a report: label/value facts, a table, or both (facts first). In Excel, facts go to the summary sheet
 * and every table gets a sheet of its own.
 *
 * @param emptyText shown instead of an empty table, e.g. "No open issues"
 */
public record ReportSection(String title, List<Fact> facts, ReportTable table, String emptyText) {

    public ReportSection {
        facts = List.copyOf(facts);
    }

    public static ReportSection facts(String title, List<Fact> facts) {
        return new ReportSection(title, facts, null, null);
    }

    public static ReportSection table(String title, ReportTable table, String emptyText) {
        return new ReportSection(title, List.of(), table, emptyText);
    }

    /** A labelled value. */
    public record Fact(String label, Cell value) {}
}
