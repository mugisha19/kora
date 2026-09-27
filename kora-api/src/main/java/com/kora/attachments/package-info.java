/**
 * Files on projects, tasks, risks, issues and change requests (feature 20). The API never carries the bytes: clients
 * upload and download with short-lived presigned URLs to S3-compatible storage, and the API checks each file's real
 * type before making it available.
 */
@ApplicationModule(displayName = "Attachments")
package com.kora.attachments;

import org.springframework.modulith.ApplicationModule;
