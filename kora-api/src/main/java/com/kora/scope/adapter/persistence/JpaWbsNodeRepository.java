package com.kora.scope.adapter.persistence;

import com.kora.scope.application.WbsNodeRepository;
import com.kora.scope.domain.WbsNode;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaWbsNodeRepository extends Repository<WbsNode, UUID>, WbsNodeRepository {}
