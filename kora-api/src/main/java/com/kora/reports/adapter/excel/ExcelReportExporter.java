package com.kora.reports.adapter.excel;

import com.kora.platform.storage.FileStorage;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.reports.Cell;
import com.kora.reports.ReportFormat;
import com.kora.reports.ReportSection;
import com.kora.reports.ReportSection.Fact;
import com.kora.reports.ReportTable;
import com.kora.reports.application.ReportDocument;
import com.kora.reports.application.ReportExporter;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Currency;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormat;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.ss.util.WorkbookUtil;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * Excel for analysis: a summary sheet with the facts, then one sheet per table with real numbers, amounts and dates
 * (sortable and summable), a frozen header and a filter. Written with POI's streaming {@link SXSSFWorkbook}: only a
 * window of rows stays in memory, the rest goes to a temporary file, so a 50,000-row sheet costs what a 100-row one
 * does.
 */
@Component
public class ExcelReportExporter extends ReportExporter {

    /** Rows kept in memory per sheet; older ones are flushed to disk. */
    static final int WINDOW = 100;

    ExcelReportExporter(FileStorage storage, TenantTransactions transactions) {
        super(storage, transactions);
    }

    @Override
    public ReportFormat format() {
        return ReportFormat.XLSX;
    }

    @Override
    protected String contentType() {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    @Override
    protected String extension() {
        return "xlsx";
    }

    @Override
    protected void render(ReportDocument document, Path target) throws IOException {
        SXSSFWorkbook workbook = new SXSSFWorkbook(WINDOW);
        workbook.setCompressTempFiles(true);
        try (OutputStream out = Files.newOutputStream(target)) {
            write(document, workbook);
            workbook.write(out);
        } finally {
            workbook.close();
        }
    }

    /** Public to the package for tests, which read the workbook back. */
    void write(ReportDocument document, SXSSFWorkbook workbook) {
        Styles styles = new Styles(workbook);
        Set<String> sheetNames = new HashSet<>();
        Sheet summary = workbook.createSheet(sheetName(document.labels().text("report.sheet.summary"), sheetNames));
        int row = 0;
        row = line(summary, row, styles.title, document.title());
        row = line(summary, row, styles.bold, document.subject());
        row++;
        row = facts(summary, row, document.about(), styles);
        for (ReportSection section : document.sections()) {
            if (!section.facts().isEmpty()) {
                row++;
                row = line(summary, row, styles.bold, section.title());
                row = facts(summary, row, section.facts(), styles);
            }
            if (section.table() != null) {
                table(workbook.createSheet(sheetName(section.title(), sheetNames)), section.table(), styles);
            }
        }
        summary.setColumnWidth(0, 32 * 256);
        summary.setColumnWidth(1, 48 * 256);
    }

    private static int line(Sheet sheet, int rowIndex, CellStyle style, String text) {
        org.apache.poi.ss.usermodel.Cell cell = sheet.createRow(rowIndex).createCell(0);
        cell.setCellValue(text);
        cell.setCellStyle(style);
        return rowIndex + 1;
    }

    private static int facts(Sheet sheet, int rowIndex, List<Fact> facts, Styles styles) {
        int next = rowIndex;
        for (Fact fact : facts) {
            Row row = sheet.createRow(next++);
            org.apache.poi.ss.usermodel.Cell label = row.createCell(0);
            label.setCellValue(fact.label());
            label.setCellStyle(styles.bold);
            write(row.createCell(1), fact.value(), styles);
        }
        return next;
    }

    private static void table(Sheet sheet, ReportTable table, Styles styles) {
        Row header = sheet.createRow(0);
        int[] widths = new int[table.headers().size()];
        for (int column = 0; column < table.headers().size(); column++) {
            org.apache.poi.ss.usermodel.Cell cell = header.createCell(column);
            cell.setCellValue(table.headers().get(column));
            cell.setCellStyle(styles.header);
            widths[column] = table.headers().get(column).length();
        }
        int rowIndex = 1;
        for (List<Cell> values : table.rows()) {
            Row row = sheet.createRow(rowIndex);
            for (int column = 0; column < values.size(); column++) {
                write(row.createCell(column), values.get(column), styles);
                // Widths from the first rows only: the rest may already be on disk.
                if (rowIndex <= WINDOW) {
                    widths[column] = Math.max(widths[column], displayLength(values.get(column)));
                }
            }
            rowIndex++;
        }
        for (int column = 0; column < widths.length; column++) {
            sheet.setColumnWidth(column, Math.min(60, widths[column] + 2) * 256);
        }
        sheet.createFreezePane(0, 1);
        if (!table.rows().isEmpty()) {
            sheet.setAutoFilter(new CellRangeAddress(0, rowIndex - 1, 0, widths.length - 1));
        }
    }

    private static void write(org.apache.poi.ss.usermodel.Cell target, Cell value, Styles styles) {
        switch (value) {
            case Cell.Text text -> {
                target.setCellValue(text.value());
                // Formula injection: text that a spreadsheet would read as a formula (= + - @, or a leading tab or
                // carriage return) gets Excel's quote prefix, the "typed with a leading apostrophe" flag. It stays
                // text even when someone edits the cell or saves the sheet as CSV, and reads unchanged.
                target.setCellStyle(isFormulaLike(text.value()) ? styles.quotedText : styles.text);
            }
            case Cell.Quantity quantity -> {
                target.setCellValue(quantity.value().doubleValue());
                target.setCellStyle(styles.number);
            }
            case Cell.Amount amount -> {
                target.setCellValue(amount.value().amount().doubleValue());
                target.setCellStyle(styles.amount(amount.value().currency()));
            }
            case Cell.Percent percent -> {
                target.setCellValue(percent.value().doubleValue() / 100);
                target.setCellStyle(styles.percent);
            }
            case Cell.Day day -> {
                target.setCellValue(day.value());
                target.setCellStyle(styles.date);
            }
            case Cell.Blank blank -> target.setBlank();
        }
    }

    /** OWASP's list of characters that start a formula in Excel, LibreOffice and Google Sheets. */
    static boolean isFormulaLike(String text) {
        if (text.isEmpty()) {
            return false;
        }
        char first = text.charAt(0);
        return first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r';
    }

    private static int displayLength(Cell cell) {
        return switch (cell) {
            case Cell.Text text -> text.value().length();
            case Cell.Day day -> LocalDate.MAX.toString().length();
            case Cell.Blank blank -> 0;
            default -> 14;
        };
    }

    /** Sheet names: at most 31 characters, none of []:*?/\\, and unique. */
    private static String sheetName(String title, Set<String> taken) {
        String base = WorkbookUtil.createSafeSheetName(title == null || title.isBlank() ? "Sheet" : title);
        String name = base;
        for (int suffix = 2; taken.contains(name.toLowerCase()); suffix++) {
            String tail = " (" + suffix + ")";
            name = base.substring(0, Math.min(base.length(), 31 - tail.length())) + tail;
        }
        taken.add(name.toLowerCase());
        return name;
    }

    /** One style per kind of cell: a workbook has a limit of 64,000 styles, so they are never created per cell. */
    private static final class Styles {

        private final SXSSFWorkbook workbook;
        private final DataFormat formats;
        private final CellStyle title;
        private final CellStyle bold;
        private final CellStyle header;
        private final CellStyle text;
        private final CellStyle quotedText;
        private final CellStyle number;
        private final CellStyle percent;
        private final CellStyle date;
        private final Map<String, CellStyle> amounts = new HashMap<>();

        Styles(SXSSFWorkbook workbook) {
            this.workbook = workbook;
            this.formats = workbook.createDataFormat();
            Font boldFont = workbook.createFont();
            boldFont.setBold(true);
            Font titleFont = workbook.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 14);
            this.title = workbook.createCellStyle();
            title.setFont(titleFont);
            this.bold = workbook.createCellStyle();
            bold.setFont(boldFont);
            this.header = workbook.createCellStyle();
            header.setFont(boldFont);
            this.text = workbook.createCellStyle();
            text.setDataFormat(formats.getFormat("@"));
            this.quotedText = workbook.createCellStyle();
            quotedText.setDataFormat(formats.getFormat("@"));
            quotedText.setQuotePrefixed(true);
            this.number = workbook.createCellStyle();
            number.setDataFormat(formats.getFormat("#,##0.##"));
            this.percent = workbook.createCellStyle();
            percent.setDataFormat(formats.getFormat("0.0%"));
            this.date = workbook.createCellStyle();
            date.setDataFormat(formats.getFormat("yyyy-mm-dd"));
        }

        /** Amounts show their currency, with its minor units (none for RWF). */
        CellStyle amount(String currency) {
            return amounts.computeIfAbsent(currency, code -> {
                int digits = minorUnits(code);
                String pattern = (digits == 0 ? "#,##0" : "#,##0." + "0".repeat(digits)) + " \"" + code + "\"";
                CellStyle style = workbook.createCellStyle();
                style.setDataFormat(formats.getFormat(pattern));
                return style;
            });
        }

        private static int minorUnits(String currency) {
            try {
                return Math.max(0, Currency.getInstance(currency).getDefaultFractionDigits());
            } catch (IllegalArgumentException unknown) {
                return 2;
            }
        }
    }
}
