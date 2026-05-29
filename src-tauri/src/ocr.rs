/// Windows OCR command – uses the built-in Windows.Media.Ocr engine
/// (available on every Windows 10/11 machine, no extra installs required).

#[derive(serde::Serialize)]
pub struct OcrWord {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Receive a base-64 encoded PNG rendered from a PDF page canvas,
/// run Windows OCR on it, and return word bounding boxes.
#[tauri::command]
pub async fn ocr_page(png_base64: String) -> std::result::Result<Vec<OcrWord>, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            run_windows_ocr(&png_base64).map_err(|e| e.to_string())
        }
        #[cfg(not(windows))]
        {
            let _ = png_base64;
            Err("Windows OCR is only available on Windows".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn run_windows_ocr(png_base64: &str) -> windows::core::Result<Vec<OcrWord>> {
    use base64::Engine as _;
    use windows::core::{Interface, HRESULT};
    use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, IRandomAccessStream, InMemoryRandomAccessStream};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    // Ensure COM/WinRT is initialised on this thread.
    let com_hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let com_inited = com_hr.is_ok(); // S_FALSE means already inited → still ok

    let result = (|| -> windows::core::Result<Vec<OcrWord>> {
        let png_bytes = base64::engine::general_purpose::STANDARD
            .decode(png_base64)
            .map_err(|e| {
                windows::core::Error::new(
                    HRESULT(-2147467259i32), // E_FAIL
                    e.to_string(),
                )
            })?;

        // Write PNG bytes into an in-memory stream.
        let stream = InMemoryRandomAccessStream::new()?;
        {
            let out = stream.GetOutputStreamAt(0)?;
            let writer = DataWriter::CreateDataWriter(&out)?;
            writer.WriteBytes(&png_bytes)?;
            writer.StoreAsync()?.get()?;
            writer.FlushAsync()?.get()?;
            // `writer` and `out` drop here, releasing the stream.
        }

        // Seek back to the start so BitmapDecoder can read from position 0.
        let ra: IRandomAccessStream = stream.cast()?;
        ra.Seek(0)?;

        // Decode PNG → SoftwareBitmap.
        let decoder = BitmapDecoder::CreateAsync(&ra)?.get()?;
        let bitmap = decoder.GetSoftwareBitmapAsync()?.get()?;

        // OcrEngine requires Bgra8 pixel format.
        let bgra = SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Bgra8)?;

        // Use the user's configured language(s) for recognition.
        let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;

        let ocr_result = engine.RecognizeAsync(&bgra)?.get()?;

        let mut words = Vec::new();
        let lines = ocr_result.Lines()?;
        for i in 0..lines.Size()? {
            let line = lines.GetAt(i)?;
            let line_words = line.Words()?;
            for j in 0..line_words.Size()? {
                let word = line_words.GetAt(j)?;
                let text = word.Text()?.to_string();
                if text.trim().is_empty() {
                    continue;
                }
                let bbox = word.BoundingRect()?;
                words.push(OcrWord {
                    text,
                    x: bbox.X,
                    y: bbox.Y,
                    w: bbox.Width,
                    h: bbox.Height,
                });
            }
        }

        Ok(words)
    })();

    if com_inited {
        unsafe { windows::Win32::System::Com::CoUninitialize() };
    }

    result
}
