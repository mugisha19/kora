package com.kora.reports.application;

import com.kora.platform.storage.FileStorage;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.reports.Cell;
import com.kora.reports.ReportContent;
import com.kora.reports.ReportFormat;
import com.kora.reports.ReportSection.Fact;
import com.kora.reports.ReportSource;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.List;
import java.util.Locale;

/**
 * Template Method for exports (feature 21): {@link #export} fixes the steps (load the data, build the document,
 * render it, store the file) and the order they run in; a format only supplies {@link #render} and its file type.
 * Adding a format is one new subclass: {@link ReportExporterFactory} finds it by {@link #format()}.
 */
public abstract class ReportExporter {

    private final FileStorage storage;
    private final TenantTransactions transactions;

    protected ReportExporter(FileStorage storage, TenantTransactions transactions) {
        this.storage = storage;
        this.transactions = transactions;
    }

    public abstract ReportFormat format();

    protected abstract String contentType();

    protected abstract String extension();

    /** Writes the document to {@code target}, a temporary file. */
    protected abstract void render(ReportDocument document, Path target) throws IOException;

    /** The fixed steps. Runs as the requester: the caller has bound their organization and membership. */
    public final StoredReport export(ReportSource source, ExportRequest request) {
        ReportContent content = loadData(source, request);
        ReportDocument document = buildModel(content, request);
        Path file = null;
        try {
            file = Files.createTempFile("kora-report-", "." + extension());
            render(document, file);
            return store(content, request, file);
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        } finally {
            deleteQuietly(file);
        }
    }

    /** One read-only transaction, so every section of the report sees the same moment. */
    protected ReportContent loadData(ReportSource source, ExportRequest request) {
        return transactions.readInOrganization(
                request.organizationId(), () -> source.build(request.params(), request.labels()));
    }

    /** Adds what every report says about itself. */
    protected ReportDocument buildModel(ReportContent content, ExportRequest request) {
        DateTimeFormatter moment = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
                .withLocale(request.labels().locale())
                .withZone(request.zone());
        List<Fact> about = List.of(
                new Fact(request.labels().text("report.about.organization"), Cell.text(request.organizationName())),
                new Fact(
                        request.labels().text("report.about.generated"),
                        Cell.text(moment.format(request.now()) + " ("
                                + request.zone().getId() + ")")),
                new Fact(request.labels().text("report.about.generatedBy"), Cell.text(request.requesterName())));
        return new ReportDocument(content.title(), content.subject(), about, content.sections(), request.labels());
    }

    private StoredReport store(ReportContent content, ExportRequest request, Path file) throws IOException {
        String day = request.now().atZone(request.zone()).toLocalDate().toString();
        String fileName = slug(content.title()) + "-" + slug(content.subject()) + "-" + day + "." + extension();
        String key = "org/" + request.organizationId() + "/reports/" + request.reportId();
        storage.put(key, file, contentType());
        return new StoredReport(fileName, key, contentType(), Files.size(file));
    }

    /** ASCII, lower case, dashes: safe in any file system and header. */
    static String slug(String text) {
        String ascii = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+)|(-+$)", "");
        String trimmed = ascii.length() <= 60 ? ascii : ascii.substring(0, 60).replaceAll("-+$", "");
        return trimmed.isEmpty() ? "report" : trimmed;
    }

    private static void deleteQuietly(Path file) {
        if (file == null) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException ignored) {
            // the OS cleans its temp directory
        }
    }
}
