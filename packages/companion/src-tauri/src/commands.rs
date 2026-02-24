//! # Tauri IPC Commands
//!
//! These are the commands exposed to the React frontend via Tauri's invoke system.
//! Every command that performs a local action goes through the safety system.

use crate::local_actions::{self, ActionRequest, ActionResult};
use crate::safety;
use serde::{Deserialize, Serialize};

/// Status response for the frontend
#[derive(Debug, Clone, Serialize)]
pub struct CompanionStatus {
    pub connected: bool,
    pub gateway_url: Option<String>,
    pub safety_active: bool,
    pub version: String,
}

/// Pairing request from frontend
#[derive(Debug, Clone, Deserialize)]
pub struct PairRequest {
    pub gateway_url: String,
    pub pairing_code: String,
}

/// Execute a local action (called by the Gateway via LLM tool calls)
#[tauri::command]
pub fn execute_action(request: ActionRequest) -> ActionResult {
    log::info!("Executing action: {} (confirmed: {})", request.action, request.confirmed);
    let result = local_actions::execute(&request);
    log::info!(
        "Action result: success={}, risk={:?}",
        result.success,
        result.safety.risk
    );
    result
}

/// Check if an action is safe without executing it
#[tauri::command]
pub fn check_safety(action: String, path: Option<String>, command: Option<String>) -> safety::SafetyVerdict {
    if let Some(cmd) = &command {
        return safety::check_shell_command(cmd);
    }
    if let Some(p) = &path {
        return safety::check_file_operation(&action, p);
    }
    safety::SafetyVerdict {
        allowed: true,
        risk: safety::RiskLevel::Safe,
        reason: "No path or command to check".into(),
        requires_confirmation: false,
    }
}

/// Get the safety system prompt (injected into every LLM request)
#[tauri::command]
pub fn get_safety_prompt() -> String {
    safety::get_safety_system_prompt()
}

/// Get companion status
#[tauri::command]
pub fn get_status() -> CompanionStatus {
    let creds = crate::connection::GatewayConnection::load_credentials();
    CompanionStatus {
        connected: creds.is_some(),
        gateway_url: creds.map(|c| c.gateway_url),
        safety_active: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Pair with a ForgeAI Gateway by redeeming a pairing code
#[tauri::command]
pub async fn pair_with_gateway(gateway_url: String, pairing_code: String) -> Result<String, String> {
    let url = format!("{}/api/companion/pair", gateway_url.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({
            "code": pairing_code,
            "deviceName": hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "Unknown".into()),
        }))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Gateway returned HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    let success = body["success"].as_bool().unwrap_or(false);
    if !success {
        let msg = body["message"].as_str().unwrap_or("Pairing failed");
        return Err(msg.to_string());
    }

    let companion_id = body["companionId"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let role = body["role"].as_str().unwrap_or("user").to_string();

    let creds = crate::connection::CompanionCredentials {
        gateway_url: gateway_url.trim_end_matches('/').to_string(),
        companion_id,
        role,
    };

    crate::connection::GatewayConnection::save_credentials(&creds)?;
    log::info!("Paired with Gateway at {}", creds.gateway_url);

    Ok("Paired successfully!".into())
}

/// Delete stored credentials (disconnect)
#[tauri::command]
pub fn disconnect() -> Result<String, String> {
    crate::connection::GatewayConnection::delete_credentials()?;
    Ok("Disconnected and credentials removed".into())
}

/// Get system info (safe, no confirmation needed)
#[tauri::command]
pub fn get_system_info() -> ActionResult {
    local_actions::execute(&ActionRequest {
        action: "system_info".into(),
        path: None,
        command: None,
        content: None,
        process_name: None,
        app_name: None,
        confirmed: false,
    })
}

// ─── Wake Word Commands ──────────────────────────────

use crate::wake_word::{self, WakeWordEngine, WakeWordStatus};
use crate::voice::{self, VoiceEngine, CapturedAudio};
use std::sync::Mutex;
use tauri::State;

/// Managed state for wake word engine
pub struct WakeWordState(pub Mutex<WakeWordEngine>);

/// Managed state for voice engine
pub struct VoiceState(pub Mutex<VoiceEngine>);

/// Configure wake word with Picovoice access key
#[tauri::command]
pub fn wake_word_configure(
    state: State<'_, WakeWordState>,
    access_key: String,
    sensitivity: f32,
    keyword_path: Option<String>,
) -> Result<String, String> {
    let mut engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.configure(access_key, sensitivity);
    if let Some(kw) = keyword_path {
        engine.set_keyword_path(kw);
    }
    Ok("Wake word configured".into())
}

/// Start wake word detection
#[tauri::command]
pub fn wake_word_start(
    state: State<'_, WakeWordState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.start(app_handle)?;
    Ok("Wake word detection started".into())
}

/// Stop wake word detection
#[tauri::command]
pub fn wake_word_stop(state: State<'_, WakeWordState>) -> Result<String, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.stop();
    Ok("Wake word detection stopped".into())
}

/// Get wake word engine status
#[tauri::command]
pub fn wake_word_status(state: State<'_, WakeWordState>) -> Result<WakeWordStatus, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    Ok(engine.status())
}

// ─── Voice Commands ──────────────────────────────────

/// Record audio from microphone (stops on silence or manual stop)
#[tauri::command]
pub fn voice_record(state: State<'_, VoiceState>) -> Result<CapturedAudio, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.record()
}

/// Stop an ongoing recording
#[tauri::command]
pub fn voice_stop(state: State<'_, VoiceState>) -> Result<String, String> {
    let engine = state.0.lock().map_err(|e| e.to_string())?;
    engine.stop_recording();
    Ok("Recording stopped".into())
}

/// Send text to Gateway TTS and play the response audio
#[tauri::command]
pub async fn voice_speak(text: String) -> Result<String, String> {
    let creds = crate::connection::GatewayConnection::load_credentials()
        .ok_or("Not connected — pair first")?;

    let engine = VoiceEngine::new();
    engine
        .speak(&creds.gateway_url, &creds.companion_id, &text)
        .await?;

    Ok("Speech played".into())
}

/// List available audio input/output devices
#[tauri::command]
pub fn list_audio_devices() -> Result<serde_json::Value, String> {
    let inputs = wake_word::list_audio_devices();
    let outputs = voice::list_output_devices();
    Ok(serde_json::json!({
        "inputs": inputs,
        "outputs": outputs,
    }))
}
