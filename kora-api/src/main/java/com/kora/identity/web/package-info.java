/**
 * Web-facing part of the identity API: how a session is returned to the browser (body plus refresh cookie).
 * Other modules that sign people in (registration, invitation acceptance) use it, so every sign-in response is
 * identical.
 */
@NamedInterface("web")
package com.kora.identity.web;

import org.springframework.modulith.NamedInterface;
