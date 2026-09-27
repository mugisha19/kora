package com.kora.attachments.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class ContentSnifferTest {

    private static final byte[] ZIP = {'P', 'K', 3, 4, 0};

    @Test
    void recognisesBinaryFormatsByTheirMagicNumbers() {
        assertThat(detect(latin1("%PDF-1.4 ..."))).isEqualTo(FileType.PDF);
        assertThat(detect(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0}))
                .isEqualTo(FileType.PNG);
        assertThat(detect(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0}))
                .isEqualTo(FileType.JPEG);
        assertThat(detect(latin1("GIF89a..."))).isEqualTo(FileType.GIF);
        assertThat(detect(latin1("RIFF\0\0\0\0WEBPVP8 "))).isEqualTo(FileType.WEBP);
    }

    @Test
    void textMustBeCleanUtf8() {
        assertThat(detect("Budget line,Amount\r\nLaptops,1 200 000 FRw\n".getBytes(StandardCharsets.UTF_8)))
                .isEqualTo(FileType.TEXT);
        assertThat(ContentSniffer.detect(new byte[] {'M', 'Z', (byte) 0x90, 0, 3, 0}, List.of()))
                .isEmpty();
        assertThat(ContentSniffer.detect(new byte[] {'a', (byte) 0xC3}, List.of()))
                .as("a sample cut inside a character is still text")
                .contains(FileType.TEXT);
        assertThat(ContentSniffer.detect(new byte[] {'a', (byte) 0xFF, 'b'}, List.of()))
                .isEmpty();
        assertThat(ContentSniffer.detect(latin1("bell\u0007"), List.of())).isEmpty();
        assertThat(ContentSniffer.detect(new byte[0], List.of())).isEmpty();
    }

    @Test
    void officeFilesAreToldApartByTheirMainPartAndMacrosAreRefused() {
        assertThat(ContentSniffer.detect(ZIP, List.of("[Content_Types].xml", "word/document.xml")))
                .contains(FileType.DOCX);
        assertThat(ContentSniffer.detect(ZIP, List.of("[Content_Types].xml", "xl/workbook.xml")))
                .contains(FileType.XLSX);
        assertThat(ContentSniffer.detect(ZIP, List.of("[Content_Types].xml", "ppt/presentation.xml")))
                .contains(FileType.PPTX);
        assertThat(ContentSniffer.detect(ZIP, List.of("[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin")))
                .isEmpty();
        assertThat(ContentSniffer.detect(ZIP, List.of("readme.txt"))).isEmpty();
    }

    @Test
    void theExtensionSaysWhatTheContentMustBe() {
        assertThat(FileType.ofFileName("Q3 Report.PDF")).contains(FileType.PDF);
        assertThat(FileType.ofFileName("photo.jpeg")).contains(FileType.JPEG);
        assertThat(FileType.ofFileName("setup.exe")).isEmpty();
        assertThat(FileType.ofFileName("no-extension")).isEmpty();
        assertThat(FileType.ofFileName("trailing.")).isEmpty();
        assertThat(FileType.CSV.accepts(FileType.TEXT)).isTrue();
        assertThat(FileType.TEXT.accepts(FileType.CSV)).isFalse();
        assertThat(FileType.PDF.accepts(FileType.PNG)).isFalse();
    }

    private static FileType detect(byte[] head) {
        return ContentSniffer.detect(head, List.of()).orElseThrow();
    }

    private static byte[] latin1(String text) {
        return text.getBytes(StandardCharsets.ISO_8859_1);
    }
}
