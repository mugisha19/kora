package com.kora.identity.web;

/** Contract schema {@code SessionResponse}. The refresh token is deliberately absent: it only travels in a cookie. */
public record SessionResponse(String accessToken, String tokenType, long expiresIn, MeResponse user) {}
