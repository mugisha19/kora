package com.kora.resourcing.adapter.persistence;

import com.kora.resourcing.application.AllocationRepository;
import com.kora.resourcing.domain.Allocation;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaAllocationRepository extends Repository<Allocation, UUID>, AllocationRepository {}
