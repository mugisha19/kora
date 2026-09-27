package com.kora.performance.adapter.persistence;

import com.kora.performance.application.EvmSnapshotRepository;
import com.kora.performance.domain.EvmSnapshot;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaEvmSnapshotRepository extends Repository<EvmSnapshot, UUID>, EvmSnapshotRepository {}
