package com.kora.reports.adapter.excel;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.reports.ReportFixtures;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ExcelReportExporterTest {

    private final ExcelReportExporter exporter = new ExcelReportExporter(null, null);

    @TempDir
    Path dir;

    @Test
    void aCellStartingWithAFormulaCharacterStaysText() throws Exception {
        try (XSSFWorkbook workbook = render(3)) {
            Sheet risks = workbook.getSheet("Risks");
            Cell hostile = risks.getRow(1).getCell(0);
            Cell plain = risks.getRow(2).getCell(0);

            assertThat(hostile.getCellType()).isEqualTo(CellType.STRING);
            assertThat(hostile.getStringCellValue()).startsWith("=HYPERLINK");
            assertThat(hostile.getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(plain.getCellStyle().getQuotePrefixed()).isFalse();
        }
    }

    @Test
    void everyFormulaStarterIsCaught() {
        for (String text : new String[] {"=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"}) {
            assertThat(ExcelReportExporter.isFormulaLike(text)).as(text).isTrue();
        }
        assertThat(ExcelReportExporter.isFormulaLike("Budget 2026")).isFalse();
        assertThat(ExcelReportExporter.isFormulaLike("")).isFalse();
    }

    @Test
    void numbersAmountsAndDatesAreRealValues() throws Exception {
        try (XSSFWorkbook workbook = render(2)) {
            Sheet risks = workbook.getSheet("Risks");
            assertThat(risks.getRow(1).getCell(1).getNumericCellValue()).isEqualTo(1.0);
            assertThat(risks.getRow(1).getCell(2).getLocalDateTimeCellValue().toLocalDate())
                    .hasToString("2026-10-01");
            assertThat(risks.getRow(1).getCell(3).getNumericCellValue()).isEqualTo(250000.0);
            assertThat(risks.getRow(1).getCell(3).getCellStyle().getDataFormatString())
                    .contains("RWF");
            assertThat(workbook.getSheet("Issues").getLastRowNum()).isZero();
            assertThat(workbook.getSheetAt(0).getRow(0).getCell(0).getStringCellValue())
                    .isEqualTo("Risk register <b>bold</b>");
        }
    }

    /** Acceptance criterion of feature 21: the rows go to disk as they are written, not into memory. */
    @Test
    void fiveThousandRowsAreStreamed() throws Exception {
        SXSSFWorkbook streaming = new SXSSFWorkbook(ExcelReportExporter.WINDOW);
        try {
            exporter.write(ReportFixtures.document(5_000), streaming);
            SXSSFSheet risks = streaming.getSheet("Risks");
            assertThat(risks.getLastFlushedRowNum())
                    .as("rows already flushed to the temporary file")
                    .isGreaterThanOrEqualTo(5_000 - ExcelReportExporter.WINDOW);
            streaming.write(OutputStream.nullOutputStream());
        } finally {
            streaming.close();
        }
        try (XSSFWorkbook workbook = render(5_000)) {
            assertThat(workbook.getSheet("Risks").getLastRowNum()).isEqualTo(5_000);
        }
    }

    private XSSFWorkbook render(int rows) throws Exception {
        Path file = dir.resolve("report-" + rows + ".xlsx");
        exporter.render(ReportFixtures.document(rows), file);
        try (InputStream in = Files.newInputStream(file)) {
            return new XSSFWorkbook(in);
        }
    }
}
