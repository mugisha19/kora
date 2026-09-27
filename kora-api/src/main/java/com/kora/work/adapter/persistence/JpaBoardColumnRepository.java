package com.kora.work.adapter.persistence;

import com.kora.work.application.BoardColumnRepository;
import com.kora.work.domain.BoardColumn;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaBoardColumnRepository extends Repository<BoardColumn, UUID>, BoardColumnRepository {}
