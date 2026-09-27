package com.kora.reports.application;

import com.kora.reports.Cell;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Currency;
import java.util.Locale;

/** Cells as text in the reader's language, for formats that show text (PDF). */
public final class CellText {

    private final Locale locale;
    private final DateTimeFormatter dates;

    public CellText(Locale locale) {
        this.locale = locale;
        this.dates = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale);
    }

    public String format(Cell cell) {
        return switch (cell) {
            case Cell.Text text -> text.value();
            case Cell.Quantity quantity -> number(quantity.value(), 2);
            case Cell.Amount amount ->
                number(amount.value().amount(), digits(amount.value().currency())) + " "
                        + amount.value().currency();
            case Cell.Percent percent -> number(percent.value(), 1) + " %";
            case Cell.Day day -> dates.format(day.value());
            case Cell.Blank blank -> "";
        };
    }

    /** Whether the value reads better right-aligned. */
    public static boolean numeric(Cell cell) {
        return cell instanceof Cell.Quantity || cell instanceof Cell.Amount || cell instanceof Cell.Percent;
    }

    private String number(BigDecimal value, int maxDigits) {
        NumberFormat format = NumberFormat.getNumberInstance(locale);
        format.setMaximumFractionDigits(maxDigits);
        format.setMinimumFractionDigits(0);
        format.setRoundingMode(RoundingMode.HALF_EVEN);
        return format.format(value);
    }

    static int digits(String currency) {
        try {
            return Math.max(0, Currency.getInstance(currency).getDefaultFractionDigits());
        } catch (IllegalArgumentException unknown) {
            return 2;
        }
    }
}
