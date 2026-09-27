package com.kora.reports;

import com.kora.platform.money.Money;
import com.kora.reports.ReportSection.Fact;
import com.kora.reports.application.ReportDocument;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Documents for exporter tests, with labels that just echo their keys. */
public final class ReportFixtures {

    private ReportFixtures() {}

    public static ReportLabels labels(Locale locale) {
        return new ReportLabels() {
            @Override
            public Locale locale() {
                return locale;
            }

            @Override
            public String text(String key, Object... args) {
                return key;
            }

            @Override
            public String value(String type, String name) {
                return name;
            }

            @Override
            public String person(UUID userId) {
                return "Person " + userId;
            }
        };
    }

    /** A summary with one of each kind of cell, and a table of {@code rows} risks, the first one hostile. */
    public static ReportDocument document(int rows) {
        List<List<Cell>> table = new ArrayList<>();
        table.add(row("=HYPERLINK(\"http://evil.example\",\"Click\")", 1));
        for (int i = 2; i <= rows; i++) {
            table.add(row("Risk " + i, i));
        }
        return new ReportDocument(
                "Risk register <b>bold</b>",
                "AKG-MB · Mobile banking",
                List.of(new Fact("Organization", Cell.text("Akagera Digital Ltd"))),
                List.of(
                        ReportSection.facts(
                                "Figures",
                                List.of(
                                        new Fact("Budget", Cell.amount(Money.of("1200000", "RWF"))),
                                        new Fact("Complete", Cell.percent(new BigDecimal("42.5"))),
                                        new Fact("SPI", Cell.quantity(new BigDecimal("0.93"))),
                                        new Fact("As of", Cell.day(LocalDate.of(2026, 9, 27))),
                                        new Fact("Nothing", Cell.BLANK))),
                        ReportSection.table(
                                "Risks",
                                new ReportTable(List.of("Title", "Score", "Review date", "Cost"), table),
                                "No risks"),
                        ReportSection.table("Issues", new ReportTable(List.of("Title"), List.of()), "No open issues")),
                labels(Locale.FRENCH));
    }

    private static List<Cell> row(String title, int score) {
        return List.of(
                Cell.text(title),
                Cell.quantity(score),
                Cell.day(LocalDate.of(2026, 10, 1)),
                Cell.amount(Money.of("250000", "RWF")));
    }
}
