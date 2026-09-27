package com.kora.attachments;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.attachments.application.AttachmentPurge;
import com.kora.attachments.application.FileStorage;
import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 20: uploads straight to storage with presigned URLs, the content check that refuses a renamed executable,
 * downloads that never render inline, access through the owner's project, and the purge.
 */
@IntegrationTest
class AttachmentIT {

    private static final byte[] PDF = "%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private FileStorage storage;

    @Autowired
    private AttachmentPurge purge;

    @Autowired
    private JdbcTemplate jdbc;

    private TestAccounts accounts;
    private Session admin;
    private Session manager;
    private Session contributor;
    private Session observer;
    private String projectId;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        observer = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
        portfolios.addToTeam(manager, projectId, observer.userId(), "OBSERVER");
    }

    @Test
    void aFileGoesStraightToStorageIsCheckedAndDownloadsAsAnAttachment() throws Exception {
        String task = new TestWork(mvc).task(manager, projectId, "Contract review", "");
        MvcTestResult started = start(contributor, "TASK", task, "Signed contract.pdf", "application/pdf", PDF.length);
        assertThat(started).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
                        {"attachment":{"ownerType":"TASK","ownerId":"%s","projectId":"%s","fileName":"Signed contract.pdf",
                                       "status":"PENDING","scanStatus":"NOT_SCANNED"},
                         "uploadMethod":"PUT","uploadHeaders":{"Content-Type":"application/pdf"}}
                        """.formatted(task, projectId));
        String id = read(started, "$.attachment.id");

        assertThat(upload(started, PDF)).isEqualTo(200);
        MvcTestResult completed = conforms(post("/api/v1/attachments/" + id + "/complete", contributor));

        assertThat(completed).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        {"status":"AVAILABLE","contentType":"application/pdf","sizeBytes":%d,"sha256":"%s"}
                        """.formatted(PDF.length, sha256(PDF)));
        assertThat(conforms(get("/api/v1/attachments?ownerType=TASK&ownerId=" + task, observer)))
                .bodyJson()
                .extractingPath("$[*].fileName")
                .isEqualTo(List.of("Signed contract.pdf"));

        String url = read(conforms(get("/api/v1/attachments/" + id + "/download", observer)), "$.url");
        HttpResponse<byte[]> download =
                HTTP.send(HttpRequest.newBuilder(URI.create(url)).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(download.statusCode()).isEqualTo(200);
        assertThat(download.body()).isEqualTo(PDF);
        assertThat(download.headers().firstValue("Content-Disposition"))
                .hasValueSatisfying(disposition -> assertThat(disposition).startsWith("attachment"));
    }

    @Test
    void aRenamedExecutableIsRefusedAndRemoved() throws Exception {
        byte[] executable = new byte[512];
        executable[0] = 'M';
        executable[1] = 'Z';
        MvcTestResult started = start(contributor, "PROJECT", projectId, "invoice.pdf", "application/pdf", 512);
        String id = read(started, "$.attachment.id");
        upload(started, executable);

        assertThat(conforms(post("/api/v1/attachments/" + id + "/complete", contributor)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("attachments.content_mismatch");
        // The bytes are gone at once; completing again finds nothing.
        assertThat(conforms(post("/api/v1/attachments/" + id + "/complete", contributor)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("attachments.not_uploaded");
        assertThat(conforms(get("/api/v1/attachments?ownerType=PROJECT&ownerId=" + projectId, contributor)))
                .bodyJson()
                .isEqualTo("[]");
    }

    @Test
    void officeDocumentsAreRecognisedButMacrosAreNot() throws Exception {
        byte[] docx = zip("[Content_Types].xml", "word/document.xml");
        MvcTestResult started = start(manager, "PROJECT", projectId, "Plan.docx", FileTypes.DOCX, docx.length);
        upload(started, docx);
        assertThat(conforms(post("/api/v1/attachments/" + read(started, "$.attachment.id") + "/complete", manager)))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.contentType")
                .isEqualTo(FileTypes.DOCX);

        byte[] withMacros = zip("[Content_Types].xml", "word/document.xml", "word/vbaProject.bin");
        MvcTestResult macro = start(manager, "PROJECT", projectId, "Plan2.docx", FileTypes.DOCX, withMacros.length);
        upload(macro, withMacros);
        assertThat(conforms(post("/api/v1/attachments/" + read(macro, "$.attachment.id") + "/complete", manager)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("attachments.content_mismatch");
    }

    @Test
    void theAnnouncedSizeAndTypeMustBeKept() throws Exception {
        assertThat(conforms(post(
                        "/api/v1/attachments/uploads",
                        contributor,
                        body("PROJECT", projectId, "setup.exe", "application/octet-stream", 10))))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("fileName");
        assertThat(conforms(post(
                        "/api/v1/attachments/uploads",
                        contributor,
                        body("PROJECT", projectId, "notes.txt", "text/html", 10))))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("contentType");

        MvcTestResult started = start(contributor, "PROJECT", projectId, "notes.txt", "text/plain", 100);
        String id = read(started, "$.attachment.id");
        assertThat(conforms(post("/api/v1/attachments/" + id + "/complete", contributor)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("attachments.not_uploaded");
        assertThat(conforms(get("/api/v1/attachments/" + id + "/download", contributor)))
                .hasStatus(HttpStatus.CONFLICT);

        upload(started, "only a few bytes".getBytes(StandardCharsets.UTF_8));
        assertThat(conforms(post("/api/v1/attachments/" + id + "/complete", contributor)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("attachments.content_mismatch");
    }

    @Test
    void theOwnersProjectDecidesWhoUploadsSeesAndDeletes() throws Exception {
        assertThat(start(observer, "PROJECT", projectId, "a.pdf", "application/pdf", PDF.length))
                .hasStatus(HttpStatus.FORBIDDEN);
        String id = available(contributor, "Minutes.pdf");

        Session stranger = accounts.registerOrganization();
        assertThat(conforms(get("/api/v1/attachments/" + id + "/download", stranger)))
                .hasStatus(HttpStatus.NOT_FOUND);
        assertThat(conforms(get("/api/v1/attachments?ownerType=PROJECT&ownerId=" + projectId, stranger)))
                .hasStatus(HttpStatus.NOT_FOUND);

        Session otherContributor = accounts.join(admin, Role.MEMBER);
        new TestPortfolios(mvc).addToTeam(manager, projectId, otherContributor.userId(), "CONTRIBUTOR");
        assertThat(conforms(delete("/api/v1/attachments/" + id, otherContributor)))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(delete("/api/v1/attachments/" + id, manager))).hasStatus(HttpStatus.NO_CONTENT);

        assertThat(conforms(get("/api/v1/attachments/" + id + "/download", contributor)))
                .hasStatus(HttpStatus.NOT_FOUND);
        assertThat(conforms(get("/api/v1/attachments?ownerType=PROJECT&ownerId=" + projectId, contributor)))
                .bodyJson()
                .isEqualTo("[]");
    }

    @Test
    void deletedFilesArePurgedAfterThirtyDays() throws Exception {
        String kept = available(contributor, "Kept.pdf");
        String old = available(contributor, "Old.pdf");
        assertThat(conforms(delete("/api/v1/attachments/" + old, contributor))).hasStatus(HttpStatus.NO_CONTENT);
        String key = jdbc.queryForObject("SELECT storage_key FROM attachments WHERE id = ?::uuid", String.class, old);
        jdbc.update("UPDATE attachments SET deleted_at = now() - interval '31 days' WHERE id = ?::uuid", old);

        purge.purgeAll();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM attachments WHERE id = ?::uuid", Integer.class, old))
                .isZero();
        assertThat(storage.size(key)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM attachments WHERE id = ?::uuid", Integer.class, kept))
                .isOne();
    }

    private String available(Session session, String fileName) throws Exception {
        MvcTestResult started = start(session, "PROJECT", projectId, fileName, "application/pdf", PDF.length);
        upload(started, PDF);
        String id = read(started, "$.attachment.id");
        assertThat(conforms(post("/api/v1/attachments/" + id + "/complete", session)))
                .hasStatusOk();
        return id;
    }

    private MvcTestResult start(
            Session session, String ownerType, String ownerId, String fileName, String contentType, long size) {
        return conforms(
                post("/api/v1/attachments/uploads", session, body(ownerType, ownerId, fileName, contentType, size)));
    }

    private static String body(String ownerType, String ownerId, String fileName, String contentType, long size) {
        return """
                {"ownerType":"%s","ownerId":"%s","fileName":"%s","contentType":"%s","sizeBytes":%d}
                """.formatted(ownerType, ownerId, fileName, contentType, size);
    }

    /** What the browser does: PUT the bytes to the presigned URL with the headers it was given. */
    private static int upload(MvcTestResult started, byte[] content) throws IOException, InterruptedException {
        HttpRequest put = HttpRequest.newBuilder(URI.create(read(started, "$.uploadUrl")))
                .header("Content-Type", read(started, "$.uploadHeaders.Content-Type"))
                .PUT(HttpRequest.BodyPublishers.ofByteArray(content))
                .build();
        return HTTP.send(put, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    private static byte[] zip(String... entries) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (String entry : entries) {
                zip.putNextEntry(new ZipEntry(entry));
                zip.write("<xml/>".getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private static String sha256(byte[] content) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }

    private MvcTestResult delete(String uri, Session session) {
        return mvc.delete().uri(uri).headers(session.headers()).exchange();
    }

    private MvcTestResult post(String uri, Session session) {
        return mvc.post().uri(uri).headers(session.headers()).exchange();
    }

    private MvcTestResult post(String uri, Session session, String body) {
        return mvc.post()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private static final class FileTypes {
        static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
}
