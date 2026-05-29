use base64::{engine::general_purpose, Engine as _};
use mail_parser::{MessageParser, MimeHeaders};

use crate::error::{Error, Result};
use crate::imap::types::{Attachment, MessageBody, UnsubscribeInfo};

pub fn parse_raw(bytes: &[u8], uid: u32) -> Result<MessageBody> {
    let parsed = MessageParser::default()
        .parse(bytes)
        .ok_or_else(|| Error::Parse("mail-parser returned None".into()))?;

    let mut html = parsed.body_html(0).map(|b| b.into_owned());
    let text = parsed.body_text(0).map(|b| b.into_owned());

    let mut attachments = Vec::new();
    for (idx, part) in parsed.attachments().enumerate() {
        let filename = part.attachment_name().map(str::to_string);
        let content_type = part
            .content_type()
            .map(|ct| match ct.subtype() {
                Some(sub) => format!("{}/{}", ct.ctype(), sub),
                None => ct.ctype().to_string(),
            })
            .unwrap_or_else(|| "application/octet-stream".to_string());
        attachments.push(Attachment {
            index: idx as u32,
            filename,
            content_type,
            size: part.contents().len() as u64,
        });
    }

    // `header_raw` returns the unparsed header value — important here because
    // mail-parser may try to structure List-Unsubscribe as addresses or as a
    // URI list, and `.as_text()` would return None in that case. The raw
    // bytes are what we need to parse against RFC 2369 / 8058 ourselves.
    // Resolve inline CID image references to base64 data URIs so the HTML is
    // self-contained in the viewer and composer (no broken <img src="cid:…">).
    if let Some(ref mut html_str) = html {
        for part in parsed.parts.iter() {
            let ct = match part.content_type() {
                Some(ct) if ct.ctype() == "image" => ct,
                _ => continue,
            };
            let cid_raw = match part.content_id() {
                Some(id) => id,
                None => continue,
            };
            // Content-ID may be wrapped in angle brackets: <id@domain>
            let cid = cid_raw.trim_matches(|c: char| c == '<' || c == '>');
            if cid.is_empty() {
                continue;
            }
            let contents = part.contents();
            if contents.is_empty() {
                continue;
            }
            let subtype = ct.subtype().unwrap_or("jpeg");
            let mime_type = format!("image/{}", subtype);
            let b64 = general_purpose::STANDARD.encode(contents);
            let data_uri = format!("data:{};base64,{}", mime_type, b64);
            *html_str = html_str.replace(&format!("cid:{}", cid), &data_uri);
        }
    }

    let lu = parsed.header_raw("List-Unsubscribe").unwrap_or("");
    let lup = parsed.header_raw("List-Unsubscribe-Post").unwrap_or("");
    let unsubscribe = extract_unsubscribe(lu, lup);

    Ok(MessageBody {
        uid,
        html,
        text,
        headers: Vec::new(),
        attachments,
        unsubscribe,
    })
}

/// Parse a `List-Unsubscribe` header into mailto / https URIs. Per RFC 2369
/// the header value is one or more angle-bracketed URIs separated by commas.
/// Order matters — the left-most URI is the sender's preferred method — but
/// we surface both so the UI can pick the path with the best UX.
fn extract_unsubscribe(
    list_unsubscribe: &str,
    list_unsubscribe_post: &str,
) -> Option<UnsubscribeInfo> {
    let header = list_unsubscribe.trim();
    if header.is_empty() {
        return None;
    }

    let mut mailto: Option<String> = None;
    let mut http: Option<String> = None;

    // Split on commas outside `<...>` groups. The grammar is simple enough
    // that a state machine is overkill — angle brackets never nest in this
    // header.
    let mut depth = 0usize;
    let mut start = 0usize;
    let bytes = header.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'<' => depth += 1,
            b'>' => depth = depth.saturating_sub(1),
            b',' if depth == 0 => {
                take_uri(&header[start..i], &mut mailto, &mut http);
                start = i + 1;
            }
            _ => {}
        }
    }
    take_uri(&header[start..], &mut mailto, &mut http);

    if mailto.is_none() && http.is_none() {
        return None;
    }

    // One-click per RFC 8058 §3.1: header must contain the literal
    // `List-Unsubscribe=One-Click`. Only valid when an https URI exists —
    // mailto one-click isn't a thing.
    let one_click = http.is_some()
        && list_unsubscribe_post
            .split(',')
            .any(|p| p.trim().eq_ignore_ascii_case("List-Unsubscribe=One-Click"));

    Some(UnsubscribeInfo {
        mailto,
        http,
        one_click,
    })
}

fn take_uri(raw: &str, mailto: &mut Option<String>, http: &mut Option<String>) {
    let trimmed = raw.trim().trim_start_matches('<').trim_end_matches('>').trim();
    if trimmed.is_empty() {
        return;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("mailto:") && mailto.is_none() {
        *mailto = Some(trimmed.to_string());
    } else if (lower.starts_with("https://") || lower.starts_with("http://"))
        && http.is_none()
    {
        *http = Some(trimmed.to_string());
    }
}

pub fn extract_attachment(bytes: &[u8], index: u32) -> Result<Vec<u8>> {
    let parsed = MessageParser::default()
        .parse(bytes)
        .ok_or_else(|| Error::Parse("mail-parser returned None".into()))?;
    let part = parsed
        .attachment(index as usize)
        .ok_or_else(|| Error::Parse(format!("attachment index {index} out of range")))?;
    Ok(part.contents().to_vec())
}
