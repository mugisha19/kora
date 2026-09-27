package com.kora.reports.adapter.pdf;

import com.kora.platform.storage.FileStorage;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.reports.ReportFormat;
import com.kora.reports.ReportSection;
import com.kora.reports.application.CellText;
import com.kora.reports.application.ReportDocument;
import com.kora.reports.application.ReportExporter;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.openpdf.text.pdf.BaseFont;
import org.springframework.stereotype.Component;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;
import org.xhtmlrenderer.pdf.ITextOutputDevice;
import org.xhtmlrenderer.pdf.ITextRenderer;
import org.xhtmlrenderer.pdf.ITextUserAgent;
import org.xhtmlrenderer.simple.extend.XhtmlNamespaceHandler;

/**
 * PDF for reading: the document is laid out by an XHTML template ({@code templates/reports/report.html}, Thymeleaf,
 * which escapes every value) and printed by Flying Saucer on OpenPDF. A4 landscape, so wide tables fit.
 */
@Component
class PdfReportExporter extends ReportExporter {

    /** Liberation Sans (SIL Open Font License), from openpdf-fonts-extra; the template asks for it by name. */
    private static final List<String> FONTS = List.of(
            "liberation/LiberationSans-Regular.ttf",
            "liberation/LiberationSans-Bold.ttf",
            "liberation/LiberationSans-Italic.ttf");

    private final TemplateEngine templates = new TemplateEngine();

    PdfReportExporter(FileStorage storage, TenantTransactions transactions) {
        super(storage, transactions);
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/reports/");
        resolver.setSuffix(".html");
        // XML mode: the output must be well-formed XHTML for Flying Saucer's XML parser.
        resolver.setTemplateMode(TemplateMode.XML);
        resolver.setCharacterEncoding("UTF-8");
        templates.setTemplateResolver(resolver);
    }

    @Override
    public ReportFormat format() {
        return ReportFormat.PDF;
    }

    @Override
    protected String contentType() {
        return "application/pdf";
    }

    @Override
    protected String extension() {
        return "pdf";
    }

    /** Pre-formatted text for the template, which then only lays it out. */
    record Row(List<Value> cells) {}

    record Value(String text, boolean numeric) {}

    record Section(
            String title,
            List<Map.Entry<String, String>> facts,
            List<String> headers,
            List<Row> rows,
            String emptyText) {}

    @Override
    protected void render(ReportDocument document, Path target) throws IOException {
        String html = html(document);
        try (OutputStream out = Files.newOutputStream(target)) {
            ITextOutputDevice device = new ITextOutputDevice(ITextRenderer.DEFAULT_DOTS_PER_POINT);
            ITextRenderer renderer = new ITextRenderer(
                    ITextRenderer.DEFAULT_DOTS_PER_POINT,
                    ITextRenderer.DEFAULT_DOTS_PER_PIXEL,
                    device,
                    new OfflineUserAgent(device, ITextRenderer.DEFAULT_DOTS_PER_PIXEL));
            for (String font : FONTS) {
                // Embedded as Unicode (Identity-H), so every character in names and titles prints.
                renderer.getFontResolver().addFont(font, BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
            }
            renderer.setDocumentFromString(html);
            renderer.layout();
            renderer.createPDF(out);
        }
    }

    /** The filled-in template; package-private for tests. */
    String html(ReportDocument document) {
        CellText text = new CellText(document.labels().locale());
        Context context = new Context(document.labels().locale());
        context.setVariable("title", document.title());
        context.setVariable("subject", document.subject());
        context.setVariable("lang", document.labels().locale().getLanguage());
        context.setVariable(
                "about",
                document.about().stream()
                        .map(fact -> Map.entry(fact.label(), text.format(fact.value())))
                        .toList());
        context.setVariable(
                "sections",
                document.sections().stream()
                        .map(section -> section(section, text))
                        .toList());
        context.setVariable("footer", document.labels().text("report.footer"));
        return templates.process("report", context);
    }

    /**
     * Loads nothing but Flying Saucer's own default style sheet (which makes {@code head} and {@code style} invisible):
     * the template has no external images, fonts or style sheets and data is escaped, so nothing a user typed can
     * make the server fetch a URL (SSRF) or read a local file while printing.
     */
    private static final class OfflineUserAgent extends ITextUserAgent {

        private static final URL DEFAULT_STYLES =
                XhtmlNamespaceHandler.class.getResource("/resources/css/XhtmlNamespaceHandler.css");

        OfflineUserAgent(ITextOutputDevice device, int dotsPerPixel) {
            super(device, dotsPerPixel);
        }

        @Override
        protected InputStream resolveAndOpenStream(String uri) {
            return DEFAULT_STYLES != null && DEFAULT_STYLES.toString().equals(uri)
                    ? super.resolveAndOpenStream(uri)
                    : null;
        }
    }

    private static Section section(ReportSection section, CellText text) {
        List<Map.Entry<String, String>> facts = section.facts().stream()
                .map(fact -> Map.entry(fact.label(), text.format(fact.value())))
                .toList();
        if (section.table() == null) {
            return new Section(section.title(), facts, List.of(), List.of(), null);
        }
        List<Row> rows = section.table().rows().stream()
                .map(row -> new Row(row.stream()
                        .map(cell -> new Value(text.format(cell), CellText.numeric(cell)))
                        .toList()))
                .toList();
        return new Section(section.title(), facts, section.table().headers(), rows, section.emptyText());
    }
}
