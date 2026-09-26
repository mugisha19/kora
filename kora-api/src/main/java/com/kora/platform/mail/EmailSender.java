package com.kora.platform.mail;

/**
 * Port for outgoing email (Adapter pattern): SMTP in the application ({@link SmtpEmailSender}, Mailpit locally), a
 * recording fake in tests. Modules send email after their transaction commits, so a rolled-back change never mails.
 */
public interface EmailSender {

    void send(EmailMessage message);
}
