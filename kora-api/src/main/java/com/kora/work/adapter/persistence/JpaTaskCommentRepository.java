package com.kora.work.adapter.persistence;

import com.kora.work.application.TaskCommentRepository;
import com.kora.work.domain.TaskComment;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaTaskCommentRepository extends Repository<TaskComment, UUID>, TaskCommentRepository {}
