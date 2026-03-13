import time
import requests
from typing import Dict, Any

def check_huggingface_health(model_id: str, api_key: str = None) -> Dict[str, Any]:
    """Check HuggingFace model availability"""
    start_time = time.time()
    try:
        from huggingface_hub import HfApi
        # HuggingFace Hub doesn't require API key for public models
        kwargs = {"token": api_key} if api_key else {}
        api = HfApi(**kwargs)
        model_info = api.model_info(model_id)
        response_time = round((time.time() - start_time) * 1000)
        return {
            "status": "healthy",
            "response_time": f"{response_time}ms",
            "message": f"Model '{model_id}' is available on HuggingFace Hub"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Model not available on HuggingFace: {str(e)}"
        }


def check_nvidia_health(api_key: str, model_id: str = None) -> Dict[str, Any]:
    """Check NVIDIA API health"""
    start_time = time.time()
    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        
        if model_id:
            # Check if specific model is available
            response = requests.get("https://integrate.api.nvidia.com/v1/models", headers=headers, timeout=10)
            response_time = round((time.time() - start_time) * 1000)
            
            if response.status_code == 200:
                models = response.json().get("data", [])
                model_names = [m.get("id", "") for m in models]
                
                if model_id in model_names:
                    return {
                        "status": "healthy",
                        "response_time": f"{response_time}ms",
                        "message": f"Model '{model_id}' is available on NVIDIA API. Found {len(models)} total models."
                    }
                else:
                    return {
                        "status": "error",
                        "response_time": f"{response_time}ms",
                        "message": f"Model '{model_id}' not found on NVIDIA API. Available models: {len(models)}"
                    }
            else:
                return {
                    "status": "error",
                    "message": f"NVIDIA API error: HTTP {response.status_code}"
                }
        else:
            # General API connectivity test
            response = requests.get("https://integrate.api.nvidia.com/v1/models", headers=headers, timeout=10)
            response_time = round((time.time() - start_time) * 1000)
            
            if response.status_code == 200:
                models = response.json().get("data", [])
                return {
                    "status": "healthy",
                    "response_time": f"{response_time}ms",
                    "message": f"NVIDIA API reachable. Found {len(models)} models."
                }
            else:
                return {
                    "status": "error",
                    "message": f"NVIDIA API error: HTTP {response.status_code}"
                }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Cannot reach NVIDIA API: {str(e)}"
        }


def check_custom_health(base_url: str) -> Dict[str, Any]:
    """Check custom endpoint connectivity"""
    start_time = time.time()
    try:
        response = requests.get(base_url, timeout=10)
        response_time = round((time.time() - start_time) * 1000)
        
        if response.status_code < 500:
            return {
                "status": "healthy",
                "response_time": f"{response_time}ms",
                "message": f"Endpoint reachable"
            }
        else:
            return {
                "status": "error",
                "message": f"Endpoint error: HTTP {response.status_code}"
            }
    except requests.exceptions.RequestException as e:
        return {
            "status": "error",
            "message": f"Cannot reach endpoint: {str(e)}"
        }
