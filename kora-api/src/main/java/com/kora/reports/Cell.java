package com.kora.reports;

import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A typed value, so each format can present it properly: numbers stay numbers in Excel (sortable, summable), and
 * amounts, percentages and dates are formatted in the reader's language in PDF.
 */
public sealed interface Cell {

    Cell BLANK = new Blank();

    /** Free text; in Excel it is always a text cell and never read as a formula. */
    record Text(String value) implements Cell {}

    /** A plain number: hours, a score, an index. */
    record Quantity(BigDecimal value) implements Cell {}

    record Amount(Money value) implements Cell {}

    /** 0 to 100. */
    record Percent(BigDecimal value) implements Cell {}

    record Day(LocalDate value) implements Cell {}

    record Blank() implements Cell {}

    static Cell text(String value) {
        return value == null || value.isBlank() ? BLANK : new Text(value);
    }

    static Cell quantity(BigDecimal value) {
        return value == null ? BLANK : new Quantity(value);
    }

    static Cell quantity(long value) {
        return new Quantity(BigDecimal.valueOf(value));
    }

    static Cell amount(Money value) {
        return value == null ? BLANK : new Amount(value);
    }

    static Cell percent(BigDecimal value) {
        return value == null ? BLANK : new Percent(value);
    }

    static Cell day(LocalDate value) {
        return value == null ? BLANK : new Day(value);
    }
}
