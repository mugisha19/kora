package com.kora.reports.application;

import com.kora.reports.ReportFormat;
import com.kora.reports.ReportSource;
import com.kora.reports.ReportType;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Factory for exports by {@code (type, format)}: the type picks the data source, the format the exporter. Both are
 * found among the Spring beans, so a new format or report type is a new class and nothing else; a missing one stops
 * the application at startup rather than failing a user's job.
 */
@Component
public class ReportExporterFactory {

    private final Map<ReportType, ReportSource> sources = new EnumMap<>(ReportType.class);
    private final Map<ReportFormat, ReportExporter> exporters = new EnumMap<>(ReportFormat.class);

    ReportExporterFactory(List<ReportSource> sources, List<ReportExporter> exporters) {
        sources.forEach(source -> register(this.sources, source.type(), source));
        exporters.forEach(exporter -> register(this.exporters, exporter.format(), exporter));
        for (ReportType type : ReportType.values()) {
            if (!this.sources.containsKey(type)) {
                throw new IllegalStateException("No ReportSource for " + type);
            }
        }
        for (ReportFormat format : ReportFormat.values()) {
            if (!this.exporters.containsKey(format)) {
                throw new IllegalStateException("No ReportExporter for " + format);
            }
        }
    }

    /** An export ready to run. */
    public record Export(ReportSource source, ReportExporter exporter) {

        public StoredReport run(ExportRequest request) {
            return exporter.export(source, request);
        }
    }

    public Export create(ReportType type, ReportFormat format) {
        return new Export(source(type), exporters.get(format));
    }

    public ReportSource source(ReportType type) {
        return sources.get(type);
    }

    private static <K, V> void register(Map<K, V> registry, K key, V value) {
        if (registry.putIfAbsent(key, value) != null) {
            throw new IllegalStateException("Two report beans for " + key);
        }
    }
}
