use lettre::{
    message::{header::{ContentType, HeaderName, HeaderValue, InReplyTo, References}, Attachment, Mailbox, Message, MessageBuilder, MultiPart, SinglePart},
    transport::smtp::{authentication::Credentials, client::Tls, AsyncSmtpTransport},
    AsyncTransport, Tokio1Executor,
};

use super::types::{
    OutgoingAttachment, OutgoingMessage, SaveToSent, SendResult, SmtpConfig, SmtpSecurity,
};
use crate::error::{Error, Result};

/// Encode a subject string for use as an RFC 2047 MIME header value.
///
/// If the string is ASCII it is returned unchanged (lettre passes it through
/// verbatim).  Otherwise every byte is placed into `=?UTF-8?B?...?=`
/// base64-encoded words of at most 45 raw bytes each.  Crucially, pairs of
/// Unicode regional-indicator characters (U+1F1E6–U+1F1FF, i.e. flag emoji)
/// are *never* split across word boundaries — splitting them causes email
/// clients that decode each word independently to show two isolated letters
/// instead of a country flag.
fn encode_subject_rfc2047(subject: &str) -> String {
    if subject.is_ascii() {
        return subject.to_string();
    }

    // 45 raw bytes → 60 base64 chars → 72-char encoded word (within RFC limit of 75).
    const MAX_BYTES: usize = 45;

    let chars: Vec<char> = subject.chars().collect();
    let mut words: Vec<String> = Vec::new();
    let mut chunk = Vec::<u8>::with_capacity(MAX_BYTES + 8);
    let mut buf = [0u8; 4];
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        let clen = c.encode_utf8(&mut buf).len();

        // Is this the first of a regional-indicator pair?
        let is_flag_start = ('\u{1F1E6}'..='\u{1F1FF}').contains(&c)
            && i + 1 < chars.len()
            && ('\u{1F1E6}'..='\u{1F1FF}').contains(&chars[i + 1]);

        let mut tmp = [0u8; 4];
        let need = if is_flag_start {
            clen + chars[i + 1].encode_utf8(&mut tmp).len()
        } else {
            clen
        };

        // Flush current chunk if adding `need` bytes would overflow it.
        if chunk.len() + need > MAX_BYTES && !chunk.is_empty() {
            words.push(format!("=?utf-8?b?{}?=", b64_encode(&chunk)));
            chunk.clear();
        }

        chunk.extend_from_slice(&buf[..clen]);
        i += 1;

        // For a flag pair, immediately add the second regional indicator to
        // keep both characters in the same encoded word.
        if is_flag_start {
            let c2 = chars[i];
            let clen2 = c2.encode_utf8(&mut buf).len();
            chunk.extend_from_slice(&buf[..clen2]);
            i += 1;
        }
    }

    if !chunk.is_empty() {
        words.push(format!("=?utf-8?b?{}?=", b64_encode(&chunk)));
    }

    words.join(" ")
}

/// Minimal standard Base64 encoder (RFC 4648 §4, with `=` padding).
fn b64_encode(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for ch in data.chunks(3) {
        let b0 = ch[0] as u32;
        let b1 = if ch.len() > 1 { ch[1] as u32 } else { 0 };
        let b2 = if ch.len() > 2 { ch[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if ch.len() > 1 { T[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if ch.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

pub async fn test_connection(config: &SmtpConfig) -> Result<()> {
    let transport = build_transport(config)?;
    let ok = transport
        .test_connection()
        .await
        .map_err(|e| Error::Smtp(format!("test: {e}")))?;
    if !ok {
        return Err(Error::Smtp("server rejected test connection".into()));
    }
    Ok(())
}

pub async fn send(
    config: &SmtpConfig,
    outgoing: &OutgoingMessage,
    save_to_sent: Option<&SaveToSent>,
) -> Result<SendResult> {
    let transport = build_transport(config)?;
    let message = build_message(outgoing)?;
    // `formatted()` materialises the full RFC822 message once. We reuse the
    // same bytes for the IMAP APPEND below, so the Sent copy is byte-identical
    // to what went out via SMTP.
    let raw = message.formatted();

    let response = transport
        .send(message)
        .await
        .map_err(|e| Error::Smtp(format!("send: {e}")))?;

    let message_id = response
        .message()
        .next()
        .map(str::to_string);

    let imap_appended = if let Some(sent) = save_to_sent {
        // Best effort — never fail the send because the Sent copy couldn't be
        // appended. The mail is already out the door by this point.
        match crate::imap::client::append_message(
            &sent.imap,
            &sent.folder,
            &raw,
            &["\\Seen".to_string()],
        )
        .await
        {
            Ok(()) => Some(true),
            Err(e) => {
                log::warn!("APPEND to Sent folder {} failed: {e}", sent.folder);
                Some(false)
            }
        }
    } else {
        None
    };

    Ok(SendResult {
        message_id,
        imap_appended,
    })
}

fn build_transport(config: &SmtpConfig) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
    let builder = match config.security {
        SmtpSecurity::Ssl => {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
                .map_err(|e| Error::Smtp(format!("relay: {e}")))?
        }
        SmtpSecurity::StartTls => {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
                .map_err(|e| Error::Smtp(format!("starttls relay: {e}")))?
        }
        SmtpSecurity::None => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
            .tls(Tls::None),
    };

    let creds = Credentials::new(config.username.clone(), config.password.clone());

    Ok(builder.port(config.port).credentials(creds).build())
}

pub fn build_message(outgoing: &OutgoingMessage) -> Result<Message> {
    let from: Mailbox = outgoing
        .from
        .parse()
        .map_err(|e| Error::Smtp(format!("parse from: {e}")))?;

    let encoded_subject = encode_subject_rfc2047(&outgoing.subject);
    let subject_hv = HeaderValue::dangerous_new_pre_encoded(
        HeaderName::new_from_ascii_str("Subject"),
        outgoing.subject.clone(),
        encoded_subject,
    );
    let mut builder: MessageBuilder = Message::builder().from(from).raw_header(subject_hv);

    for to in &outgoing.to {
        let addr: Mailbox = to
            .parse()
            .map_err(|e| Error::Smtp(format!("parse to: {e}")))?;
        builder = builder.to(addr);
    }
    for cc in &outgoing.cc {
        let addr: Mailbox = cc
            .parse()
            .map_err(|e| Error::Smtp(format!("parse cc: {e}")))?;
        builder = builder.cc(addr);
    }
    for bcc in &outgoing.bcc {
        let addr: Mailbox = bcc
            .parse()
            .map_err(|e| Error::Smtp(format!("parse bcc: {e}")))?;
        builder = builder.bcc(addr);
    }
    if let Some(reply_to) = &outgoing.reply_to {
        let addr: Mailbox = reply_to
            .parse()
            .map_err(|e| Error::Smtp(format!("parse reply-to: {e}")))?;
        builder = builder.reply_to(addr);
    }
    if let Some(irt) = &outgoing.in_reply_to {
        builder = builder.header(InReplyTo::from(irt.clone()));
    }
    if let Some(refs) = &outgoing.references {
        builder = builder.header(References::from(refs.clone()));
    }

    let body = build_body(&outgoing.html, &outgoing.text)?;

    let message = if outgoing.attachments.is_empty() {
        match body {
            MessageBody::Multi(mp) => builder.multipart(mp),
            MessageBody::Single(sp) => builder.singlepart(sp),
        }
    } else {
        let mut mixed = match body {
            MessageBody::Multi(mp) => MultiPart::mixed().multipart(mp),
            MessageBody::Single(sp) => MultiPart::mixed().singlepart(sp),
        };
        for a in &outgoing.attachments {
            mixed = mixed.singlepart(build_attachment_part(a)?);
        }
        builder.multipart(mixed)
    };

    message.map_err(|e| Error::Smtp(format!("build message: {e}")))
}

enum MessageBody {
    Multi(MultiPart),
    Single(SinglePart),
}

fn build_body(html: &Option<String>, text: &Option<String>) -> Result<MessageBody> {
    match (html, text) {
        (Some(h), Some(t)) => Ok(MessageBody::Multi(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(t.clone()),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(h.clone()),
                ),
        )),
        (Some(h), None) => Ok(MessageBody::Single(
            SinglePart::builder()
                .header(ContentType::TEXT_HTML)
                .body(h.clone()),
        )),
        (None, Some(t)) => Ok(MessageBody::Single(
            SinglePart::builder()
                .header(ContentType::TEXT_PLAIN)
                .body(t.clone()),
        )),
        (None, None) => Err(Error::Smtp("message must have html or text body".into())),
    }
}

fn build_attachment_part(a: &OutgoingAttachment) -> Result<SinglePart> {
    let bytes = std::fs::read(&a.path)?;
    let ct_str = a.content_type.as_deref().unwrap_or("application/octet-stream");
    let content_type = ContentType::parse(ct_str)
        .map_err(|e| Error::Smtp(format!("parse content-type {ct_str}: {e}")))?;
    Ok(Attachment::new(a.filename.clone()).body(bytes, content_type))
}
