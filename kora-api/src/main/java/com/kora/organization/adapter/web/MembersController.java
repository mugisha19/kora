package com.kora.organization.adapter.web;

import com.kora.organization.Role;
import com.kora.organization.adapter.web.OrganizationDtos.ChangeMemberRoleRequest;
import com.kora.organization.adapter.web.OrganizationDtos.MemberResponse;
import com.kora.organization.application.MemberSearch;
import com.kora.organization.application.MemberService;
import com.kora.organization.domain.Membership;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Members}. */
@RestController
@RequestMapping("/api/v1/members")
class MembersController {

    private final MemberService members;

    MembersController(MemberService members) {
        this.members = members;
    }

    @GetMapping
    PageResponse<MemberResponse> list(
            @RequestParam(name = "q", required = false) @Size(max = 100) String query,
            @RequestParam(name = "role", required = false) Role role,
            Pageable pageable) {
        return PageResponse.from(members.search(new MemberSearch(query, role), pageable), MemberResponse::from);
    }

    @PatchMapping("/{memberId}")
    ResponseEntity<MemberResponse> changeRole(
            @PathVariable("memberId") UUID memberId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody ChangeMemberRoleRequest body) {
        Membership membership = members.changeRole(memberId, expectedVersion, body.role());
        return ResponseEntity.ok().eTag(EntityTags.of(membership.getVersion())).body(MemberResponse.from(membership));
    }

    @DeleteMapping("/{memberId}")
    ResponseEntity<Void> remove(@PathVariable("memberId") UUID memberId) {
        members.remove(memberId);
        return ResponseEntity.noContent().build();
    }
}
