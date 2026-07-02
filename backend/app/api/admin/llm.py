import logging
from flask import request, jsonify

from app.api import api_bp
from app.api.middleware import require_auth
from app.repositories.settings_repository import SettingsRepository
from app.core.security import decrypt_api_key
from app.core.config import settings

logger = logging.getLogger(__name__)


@api_bp.route("/admin/llm/test-connection", methods=["POST"])
@require_auth(role="admin")
def admin_test_llm_connection():
    payload = request.get_json(silent=True) or {}
    provider = payload.get("llm_provider", "").strip().lower()
    model_name = payload.get("llm_model", "").strip()
    api_key = payload.get("llm_api_key", "").strip()

    # Get existing encrypted API key if sent masked
    if api_key == "********":
        cfg = SettingsRepository.get_settings_by_keys(["llm_api_key"])
        api_key_val = cfg.get("llm_api_key", "")
        if api_key_val:
            api_key = decrypt_api_key(api_key_val)

    model_string = f"{provider}/{model_name}" if "/" not in model_name else model_name

    try:
        import litellm
        litellm.telemetry = False
        
        test_msg = [{"role": "user", "content": "Hello. Return only the single word 'OK'."}]
        
        if provider == "ollama":
            res = litellm.completion(
                model=model_string,
                messages=test_msg,
                api_base=settings.OLLAMA_BASE_URL,
                timeout=10
            )
        else:
            res = litellm.completion(
                model=model_string,
                messages=test_msg,
                api_key=api_key if api_key else None,
                timeout=10
            )
            
        content = res.choices[0].message.content.strip()
        return jsonify({"success": True, "response": content})
    except Exception as e:
        logger.exception("LiteLLM test connection failed")
        return jsonify({"success": False, "error": str(e)})


@api_bp.route("/admin/llm/detect-models", methods=["POST"])
@require_auth(role="admin")
def admin_detect_models():
    payload = request.get_json(silent=True) or {}
    provider = payload.get("llm_provider", "").strip().lower()
    api_key = payload.get("llm_api_key", "").strip()

    if api_key == "********":
        cfg = SettingsRepository.get_settings_by_keys(["llm_api_key"])
        api_key_val = cfg.get("llm_api_key", "")
        if api_key_val:
            api_key = decrypt_api_key(api_key_val)

    fallback_models = {
        "groq": ["llama-3.1-8b-instant", "llama3-8b-8192", "llama3-70b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"],
        "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "gemini": ["gemini-1.5-flash", "gemini-1.5-pro"],
        "deepseek": ["deepseek-chat", "deepseek-reasoner"],
        "ollama": ["llama3", "mistral", "gemma", "phi3"]
    }

    models = []
    error_msg = None

    try:
        if provider == "groq":
            import requests
            headers = {"Authorization": f"Bearer {api_key}"}
            r = requests.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=5)
            if r.status_code == 200:
                models = [m["id"] for m in r.json().get("data", [])]
            else:
                raise Exception(f"Groq API returned status {r.status_code}")
                
        elif provider == "openai":
            import requests
            headers = {"Authorization": f"Bearer {api_key}"}
            r = requests.get("https://api.openai.com/v1/models", headers=headers, timeout=5)
            if r.status_code == 200:
                models = [m["id"] for m in r.json().get("data", []) if "gpt" in m["id"] or "o1" in m["id"]]
            else:
                raise Exception(f"OpenAI API returned status {r.status_code}")
                
        elif provider == "gemini":
            import requests
            r = requests.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}", timeout=5)
            if r.status_code == 200:
                models = [m["name"].split("/")[-1] for m in r.json().get("models", []) if "gemini" in m["name"]]
            else:
                raise Exception(f"Gemini API returned status {r.status_code}")
                
        elif provider == "deepseek":
            import requests
            headers = {"Authorization": f"Bearer {api_key}"}
            r = requests.get("https://api.deepseek.com/models", headers=headers, timeout=5)
            if r.status_code == 200:
                models = [m["id"] for m in r.json().get("data", [])]
            else:
                raise Exception(f"DeepSeek API returned status {r.status_code}")
                
        elif provider == "ollama":
            import requests
            r = requests.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=5)
            if r.status_code == 200:
                models = [m["name"] for m in r.json().get("models", [])]
            else:
                raise Exception(f"Ollama API returned status {r.status_code}")
        else:
            error_msg = f"Provider '{provider}' tidak dikenal."
            
    except Exception as e:
        logger.warning("Auto model detection failed: %s. Using fallback list.", e)
        error_msg = f"Koneksi gagal: {e}. Menggunakan daftar model bawaan."

    # Prioritize standard models from fallback list to the top
    standards = fallback_models.get(provider, [])
    prioritized_models = []
    
    # Filter and clean models list
    models = [m for m in models if m]
    
    for std in standards:
        matches = [m for m in models if m.lower() == std.lower() or std.lower() in m.lower()]
        for m in matches:
            if m not in prioritized_models:
                prioritized_models.append(m)
                
    # Add all remaining models that are not in the prioritized list
    for m in models:
        if m not in prioritized_models:
            # Skip model if it looks like an incompatible third-party model
            if "/" in m and not m.startswith(f"{provider}/"):
                continue
            prioritized_models.append(m)
            
    # If the list is empty, use the fallback list
    if not prioritized_models:
        prioritized_models = standards
        
    models = prioritized_models

    return jsonify({
        "success": True,
        "models": models,
        "error_msg": error_msg
    })


@api_bp.route("/admin/tts/test", methods=["POST"])
@require_auth(role="admin")
def admin_tts_test():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()
    provider = payload.get("provider", "edge-tts")
    language = payload.get("language", "id-ID")
    voice = payload.get("voice", "")

    if not text:
        return jsonify({"error": "Teks uji suara tidak boleh kosong."}), 400

    from app.services.speech_service import SpeechService
    speech_service = SpeechService()
    
    filename = speech_service.speak_custom(text, provider, language, voice)
    if not filename:
        return jsonify({"error": "Gagal mensintesis uji suara TTS."}), 500

    return jsonify({"audio_url": f"/api/audio/{filename}"})