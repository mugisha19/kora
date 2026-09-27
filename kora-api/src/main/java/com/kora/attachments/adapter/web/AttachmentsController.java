package com.kora.attachments.adapter.web;

import com.kora.attachments.application.AttachmentService;
import com.kora.attachments.application.AttachmentService.Download;
import com.kora.attachments.application.AttachmentService.NewUpload;
import com.kora.attachments.application.AttachmentService.Upload;
import com.kora.attachments.domain.Attachment;
import com.kora.attachments.domain.AttachmentOwnerType;
import com.kora.attachments.domain.AttachmentStatus;
import com.kora.attachments.domain.ScanStatus;
import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.platform.web.UserRefJson;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Attachments} (feature 20). */
@RestController
class AttachmentsController {

    private final AttachmentService attachments;
    private final MemberDirectory members;
    private final UserAccounts accounts;

    AttachmentsController(AttachmentService attachments, MemberDirectory members, UserAccounts accounts) {
        this.attachments = attachments;
        this.members = members;
        this.accounts = accounts;
    }

    record StartUploadRequest(
            @NotNull AttachmentOwnerType ownerType,
            @NotNull UUID ownerId,
            @NotBlank @Size(max = 200) String fileName,
            @NotBlank @Size(max = 100) String contentType,
            @NotNull @Min(1) @Max(26_214_400) Long sizeBytes) {}

    record AttachmentResponse(
            UUID id,
            AttachmentOwnerType ownerType,
            UUID ownerId,
            UUID projectId,
            String fileName,
            String contentType,
            long sizeBytes,
            String sha256,
            AttachmentStatus status,
            ScanStatus scanStatus,
            UserRefJson uploadedBy,
            Instant uploadedAt) {}

    record AttachmentUploadResponse(
            AttachmentResponse attachment,
            String uploadUrl,
            String uploadMethod,
            Map<String, String> uploadHeaders,
            Instant expiresAt) {}

    record AttachmentDownloadResponse(String url, Instant expiresAt) {}

    @PostMapping("/api/v1/attachments/uploads")
    @ResponseStatus(HttpStatus.CREATED)
    AttachmentUploadResponse start(@Valid @RequestBody StartUploadRequest request) {
        Upload upload = attachments.start(new NewUpload(
                request.ownerType(),
                request.ownerId(),
                request.fileName(),
                request.contentType(),
                request.sizeBytes()));
        return new AttachmentUploadResponse(
                responses(List.of(upload.attachment())).getFirst(),
                upload.url().toString(),
                "PUT",
                Map.of("Content-Type", upload.contentType()),
                upload.expiresAt());
    }

    @PostMapping("/api/v1/attachments/{attachmentId}/complete")
    AttachmentResponse complete(@PathVariable("attachmentId") UUID attachmentId) {
        return responses(List.of(attachments.complete(attachmentId))).getFirst();
    }

    @GetMapping("/api/v1/attachments")
    List<AttachmentResponse> list(
            @RequestParam("ownerType") AttachmentOwnerType ownerType, @RequestParam("ownerId") UUID ownerId) {
        return responses(attachments.list(ownerType, ownerId));
    }

    @DeleteMapping("/api/v1/attachments/{attachmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable("attachmentId") UUID attachmentId) {
        attachments.delete(attachmentId);
    }

    @GetMapping("/api/v1/attachments/{attachmentId}/download")
    AttachmentDownloadResponse download(@PathVariable("attachmentId") UUID attachmentId) {
        Download download = attachments.download(attachmentId);
        return new AttachmentDownloadResponse(download.url().toString(), download.expiresAt());
    }

    private List<AttachmentResponse> responses(List<Attachment> found) {
        List<UUID> uploaders =
                found.stream().map(Attachment::getUploadedBy).distinct().toList();
        Map<UUID, String> names = new HashMap<>();
        members.findAll(uploaders).forEach((id, member) -> names.put(id, member.fullName()));
        // Someone who has left keeps their name on what they uploaded.
        uploaders.forEach(
                id -> names.computeIfAbsent(id, missing -> accounts.get(missing).fullName()));
        return found.stream()
                .map(attachment -> new AttachmentResponse(
                        attachment.getId(),
                        attachment.getOwnerType(),
                        attachment.getOwnerId(),
                        attachment.getProjectId(),
                        attachment.getFileName(),
                        attachment.getContentType() == null
                                ? attachment.getDeclaredContentType()
                                : attachment.getContentType(),
                        attachment.getSizeBytes(),
                        attachment.getSha256(),
                        attachment.getStatus(),
                        attachment.getScanStatus(),
                        new UserRefJson(attachment.getUploadedBy(), names.get(attachment.getUploadedBy())),
                        attachment.getUploadedAt()))
                .toList();
    }
}
