package com.kora.governance.application;

import com.kora.governance.domain.ChangeRequest;
import com.kora.governance.domain.ChangeRequestStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for change requests (tenant-filtered); steps are saved with their request. */
public interface ChangeRequestRepository {

    Optional<ChangeRequest> findById(UUID id);

    Page<ChangeRequest> findByProjectId(UUID projectId, Pageable pageable);

    Page<ChangeRequest> findByProjectIdAndStatus(UUID projectId, ChangeRequestStatus status, Pageable pageable);

    List<ChangeRequest> findByStatusInOrderBySubmittedAtAsc(Collection<ChangeRequestStatus> statuses);

    boolean existsByCostDeltaAmountIsNotNull();

    long countByProjectIdAndStatusIn(UUID projectId, Collection<ChangeRequestStatus> statuses);

    ChangeRequest save(ChangeRequest request);

    ChangeRequest saveAndFlush(ChangeRequest request);
}
