//! # Voice I/O Module
//!
//! Handles microphone capture → WAV encoding → send to Gateway STT,
//! and receives TTS audio from Gateway → plays back via speakers.
//! Uses cpal for capture and rodio for playback.

use base64::Engine as _;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Captured audio result
#[derive(Clone, serde::Serialize)]
pub struct CapturedAudio {
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub samples: usize,
    /// Base64-encoded WAV data
    pub wav_base64: String,
}

/// Voice engine for capture and playback
pub struct VoiceEngine {
    recording: Arc<AtomicBool>,
    max_duration_secs: u32,
    silence_threshold: f32,
    silence_timeout_ms: u64,
}

impl VoiceEngine {
    pub fn new() -> Self {
        Self {
            recording: Arc::new(AtomicBool::new(false)),
            max_duration_secs: 30,
            silence_threshold: 0.01,
            silence_timeout_ms: 800,
        }
    }

    /// Configure voice engine parameters
    pub fn configure(&mut self, max_duration_secs: u32, silence_threshold: f32, silence_timeout_ms: u64) {
        self.max_duration_secs = max_duration_secs;
        self.silence_threshold = silence_threshold;
        self.silence_timeout_ms = silence_timeout_ms;
    }

    /// Is currently recording?
    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::Relaxed)
    }

    /// Stop recording
    pub fn stop_recording(&self) {
        self.recording.store(false, Ordering::Relaxed);
    }

    /// Record audio with real-time level events emitted to the frontend.
    /// Sends `voice-audio-level` events with { level: f32 } every ~50ms
    /// so the UI can render a live waveform visualization.
    pub fn record_with_events(&self, app_handle: &tauri::AppHandle) -> Result<CapturedAudio, String> {
        use tauri::Emitter;
        let handle = app_handle.clone();

        // We'll collect levels and emit them during recording
        let emit_handle = handle.clone();
        let result = self.record_internal(Some(emit_handle));
        // Signal recording ended
        let _ = handle.emit("voice-audio-level", serde_json::json!({ "level": 0.0, "done": true }));
        result
    }

    /// Record audio from microphone until silence or max duration.
    /// Returns base64-encoded WAV data ready to send to Gateway STT.
    /// Uses device's native config and resamples to 16kHz mono.
    pub fn record(&self) -> Result<CapturedAudio, String> {
        self.record_internal(None)
    }

    fn record_internal(&self, app_handle: Option<tauri::AppHandle>) -> Result<CapturedAudio, String> {
        if self.recording.load(Ordering::Relaxed) {
            // Force-reset if stuck
            self.recording.store(false, Ordering::Relaxed);
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        self.recording.store(true, Ordering::Relaxed);
        let recording = self.recording.clone();
        let silence_threshold = self.silence_threshold;
        let silence_timeout_ms = self.silence_timeout_ms;
        let max_duration_secs = self.max_duration_secs;

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No audio input device")?;

        // Use device's default config instead of forcing 16kHz
        let supported = device
            .default_input_config()
            .map_err(|e| format!("No supported input config: {}", e))?;

        let native_rate = supported.sample_rate().0;
        let native_channels = supported.channels() as usize;

        log::info!(
            "Voice: using native config: {}Hz, {} channels",
            native_rate,
            native_channels
        );

        let config = cpal::StreamConfig {
            channels: native_channels as u16,
            sample_rate: cpal::SampleRate(native_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let max_native_samples = (native_rate as usize * max_duration_secs as usize) * native_channels;
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(128);

        let result = device.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let _ = tx.try_send(data.to_vec());
            },
            |err| log::error!("Audio capture error: {}", err),
            None,
        );

        let stream = match result {
            Ok(s) => s,
            Err(e) => {
                recording.store(false, Ordering::Relaxed);
                return Err(format!("Failed to build input stream: {}", e));
            }
        };

        if let Err(e) = stream.play() {
            recording.store(false, Ordering::Relaxed);
            return Err(format!("Failed to start recording: {}", e));
        }

        log::info!("Voice: recording started");

        let mut all_samples: Vec<f32> = Vec::with_capacity(max_native_samples);
        let mut last_voice_time = std::time::Instant::now();
        let start = std::time::Instant::now();

        let mut last_emit = std::time::Instant::now();

        // Capture loop — stops on silence, max duration, or manual stop
        while recording.load(Ordering::Relaxed) {
            match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                Ok(samples) => {
                    // Downmix to mono for RMS check
                    let mono: Vec<f32> = if native_channels > 1 {
                        samples.chunks(native_channels)
                            .map(|ch| ch.iter().sum::<f32>() / native_channels as f32)
                            .collect()
                    } else {
                        samples.clone()
                    };

                    let rms: f32 = (mono.iter().map(|s| s * s).sum::<f32>()
                        / mono.len().max(1) as f32)
                        .sqrt();

                    if rms > silence_threshold {
                        last_voice_time = std::time::Instant::now();
                    }

                    // Emit audio level to frontend for waveform visualization (~20fps)
                    if last_emit.elapsed().as_millis() >= 50 {
                        if let Some(ref handle) = app_handle {
                            use tauri::Emitter;
                            let level = (rms * 10.0).min(1.0); // normalize to 0..1
                            let _ = handle.emit("voice-audio-level", serde_json::json!({
                                "level": level,
                                "done": false
                            }));
                        }
                        last_emit = std::time::Instant::now();
                    }

                    all_samples.extend_from_slice(&samples);

                    if all_samples.len() >= max_native_samples {
                        log::info!("Voice: max duration reached");
                        break;
                    }

                    // Need at least 0.5s of audio before checking silence
                    let min_samples = native_rate as usize * native_channels / 2;
                    if last_voice_time.elapsed().as_millis() as u64 > silence_timeout_ms
                        && all_samples.len() > min_samples
                    {
                        log::info!("Voice: silence detected, stopping");
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if start.elapsed().as_secs() >= max_duration_secs as u64 {
                        break;
                    }
                    continue;
                }
                Err(_) => break,
            }
        }

        drop(stream);
        recording.store(false, Ordering::Relaxed);

        // Convert to 16kHz mono
        let mono_samples: Vec<f32> = if native_channels > 1 {
            all_samples.chunks(native_channels)
                .map(|ch| ch.iter().sum::<f32>() / native_channels as f32)
                .collect()
        } else {
            all_samples
        };

        // Resample to 16kHz if needed
        let final_samples = if native_rate != 16000 {
            resample(&mono_samples, native_rate, 16000)
        } else {
            mono_samples
        };

        let duration_ms = (final_samples.len() as f64 / 16.0) as u64;
        log::info!(
            "Voice: recorded {} samples ({}ms) after resample",
            final_samples.len(),
            duration_ms
        );

        if final_samples.len() < 1600 {
            return Err("Recording too short (< 100ms)".into());
        }

        // Encode to WAV
        let wav_data = encode_wav(&final_samples, 16000)?;
        let wav_base64 = base64::engine::general_purpose::STANDARD.encode(&wav_data);

        Ok(CapturedAudio {
            duration_ms,
            sample_rate: 16000,
            samples: final_samples.len(),
            wav_base64,
        })
    }

    /// Send recorded audio to Gateway for STT transcription
    pub async fn transcribe(
        &self,
        gateway_url: &str,
        jwt_token: &str,
        audio: &CapturedAudio,
    ) -> Result<String, String> {
        let url = format!("{}/api/voice/transcribe", gateway_url.trim_end_matches('/'));

        let wav_bytes = base64::engine::general_purpose::STANDARD
            .decode(&audio.wav_base64)
            .map_err(|e| format!("Base64 decode error: {}", e))?;

        // Build multipart form
        let part = reqwest::multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| format!("MIME error: {}", e))?;

        let form = reqwest::multipart::Form::new().part("audio", part);

        let client = reqwest::Client::new();
        let resp = client
            .post(&url)
            .header("Cookie", format!("forgeai_session={}", jwt_token))
            .multipart(form)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("Transcribe request failed: {}", e))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Transcription failed: {}", text));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Parse error: {}", e))?;

        data["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or("No transcription text in response".into())
    }

    /// Request TTS from Gateway and play the audio
    pub async fn speak(
        &self,
        gateway_url: &str,
        jwt_token: &str,
        text: &str,
    ) -> Result<(), String> {
        let url = format!(
            "{}/api/voice/synthesize",
            gateway_url.trim_end_matches('/')
        );

        let client = reqwest::Client::new();
        let resp = client
            .post(&url)
            .header("Cookie", format!("forgeai_session={}", jwt_token))
            .json(&serde_json::json!({ "text": text }))
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("TTS request failed: {}", e))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("TTS failed: {}", text));
        }

        let audio_bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Read audio failed: {}", e))?;

        // Play audio using rodio
        play_audio_bytes(&audio_bytes)?;

        Ok(())
    }
}

/// Simple linear interpolation resampler (from_rate → to_rate)
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (samples.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos as usize;
        let frac = src_pos - idx as f64;
        let s0 = samples[idx.min(samples.len() - 1)];
        let s1 = samples[(idx + 1).min(samples.len() - 1)];
        output.push(s0 + (s1 - s0) * frac as f32);
    }
    output
}

/// Encode f32 samples to WAV bytes
fn encode_wav(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    {
        let cursor = Cursor::new(&mut buffer);
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer =
            hound::WavWriter::new(cursor, spec).map_err(|e| format!("WAV writer error: {}", e))?;

        for &sample in samples {
            let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            writer
                .write_sample(s16)
                .map_err(|e| format!("WAV write error: {}", e))?;
        }

        writer
            .finalize()
            .map_err(|e| format!("WAV finalize error: {}", e))?;
    }
    Ok(buffer)
}

/// Play audio bytes (WAV/MP3 format) through the default output device
pub fn play_audio_bytes(audio_bytes: &[u8]) -> Result<(), String> {
    let (_stream, stream_handle) = rodio::OutputStream::try_default()
        .map_err(|e| format!("Audio output error: {}", e))?;

    let cursor = Cursor::new(audio_bytes.to_vec());
    let source = rodio::Decoder::new(cursor)
        .map_err(|e| format!("Audio decode error: {}", e))?;

    let sink = rodio::Sink::try_new(&stream_handle)
        .map_err(|e| format!("Sink error: {}", e))?;

    sink.append(source);
    sink.sleep_until_end();

    Ok(())
}

/// List available audio output devices
pub fn list_output_devices() -> Vec<String> {
    let host = cpal::default_host();
    host.output_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}
