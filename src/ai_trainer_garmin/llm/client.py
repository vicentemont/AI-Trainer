"""One interface over OpenAI, Anthropic and Gemini. The user supplies their own key."""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ValidationError

DEFAULT_MODELS = {"openai": "gpt-4.1", "anthropic": "claude-sonnet-5-5", "gemini": "gemini-2.5-pro"}

class Completer(Protocol):
    def __call__(self, system: str, user: str) -> str: ...


def make_completer(provider: str, api_key: str, model: str | None = None) -> Completer:
    model = model or DEFAULT_MODELS[provider]
    if provider == "openai":
        from openai import OpenAI

        client = OpenAI(api_key=api_key, timeout=120, max_retries=1)
        return lambda system, user: client.chat.completions.create(
            model=model, response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        ).choices[0].message.content
    if provider == "anthropic":
        import anthropic

        client = anthropic.Anthropic(api_key=api_key, timeout=120, max_retries=1)
        return lambda system, user: client.messages.create(
            model=model, max_tokens=32000, system=system,
            messages=[{"role": "user", "content": user}],
        ).content[0].text
    if provider == "gemini":
        from google import genai

        client = genai.Client(api_key=api_key, http_options={'timeout': 120_000})
        return lambda system, user: client.models.generate_content(
            model=model, contents=user,
            config={"system_instruction": system, "response_mime_type": "application/json"},
        ).text
    raise ValueError(f"unknown provider {provider!r}")


def _extract_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start != -1 else text


def ask_json[T: BaseModel](complete: Completer, system: str, user: str, model: type[T], retries: int = 2) -> T:
    """Call the LLM and validate its JSON answer against `model`, feeding errors back on retry."""
    last_err = ""
    for _ in range(retries + 1):
        prompt = user if not last_err else f"{user}\n\nYour previous answer was invalid: {last_err}\nFix it."
        raw = complete(system, prompt)
        try:
            return model.model_validate_json(_extract_json(raw))
        except ValidationError as e:
            last_err = str(e)[:1500]
    raise RuntimeError(f"The AI returned an invalid response: {last_err}")
