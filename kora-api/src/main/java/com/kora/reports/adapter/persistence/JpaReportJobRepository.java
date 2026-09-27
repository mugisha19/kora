package com.kora.reports.adapter.persistence;

import com.kora.reports.application.ReportJobRepository;
import com.kora.reports.domain.ReportJob;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaReportJobRepository extends Repository<ReportJob, UUID>, ReportJobRepository {}
