package com.kora.reports.adapter.pdf;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.reports.ReportFixtures;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;

class PdfReportExporterTest {

    private final PdfReportExporter exporter = new PdfReportExporter(null, null);

    @TempDir
    Path dir;

    @Test
    void rendersEverySectionAsEscapedText() throws Exception {
        Path file = dir.resolve("report.pdf");

        exporter.render(ReportFixtures.document(40), file);

        assertThat(Files.readAllBytes(file)).startsWith("%PDF".getBytes());
        String raw = text(file);
        // With the built-in PDF fonts this narrow no-break space (French digit grouping) would be dropped.
        assertThat(raw).contains(" ");
        String text = raw.replaceAll("[\s  ]+", " ");
        assertThat(text)
                // Markup in data is shown, never interpreted.
                .contains("Risk register <b>bold</b>")
                .contains("AKG-MB")
                .contains("Mobile banking")
                .contains("=HYPERLINK")
                .contains("Risk 40")
                .contains("No open issues")
                // The style sheet is applied, not printed.
                .doesNotContain("@page")
                // French formats: grouped thousands, decimal comma, amounts with their currency.
                .contains("1 200 000 RWF")
                .contains("42,5 %");
    }

    private static String text(Path file) throws Exception {
        PdfReader reader = new PdfReader(Files.readAllBytes(file));
        try {
            PdfTextExtractor extractor = new PdfTextExtractor(reader);
            StringBuilder all = new StringBuilder();
            for (int page = 1; page <= reader.getNumberOfPages(); page++) {
                all.append(extractor.getTextFromPage(page)).append('\n');
            }
            return all.toString();
        } finally {
            reader.close();
        }
    }
}
