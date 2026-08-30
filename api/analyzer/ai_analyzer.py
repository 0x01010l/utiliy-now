"""Optional LLM-powered qualitative analysis via Azure OpenAI."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import AzureOpenAI


def _client() -> AzureOpenAI | None:
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    key = os.getenv("AZURE_OPENAI_KEY")
    if not endpoint or not key:
        return None
    return AzureOpenAI(
        azure_endpoint=endpoint.rstrip("/"),
        api_key=key,
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
    )


async def analyze_with_llm(crawl_summary: dict[str, Any]) -> dict[str, Any] | None:
    client = _client()
    if not client:
        return None

    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    prompt = {
        "role": "user",
        "content": (
            "You are an ecommerce product page auditor. Analyze this extracted page data and return JSON only with keys: "
            "content_quality_score (0-100), conversion_clarity_score (0-100), content_issues (array of {severity, message}), "
            "conversion_issues (array), recommendations (array of short actionable strings max 5), "
            "ai_shopping_notes (string). Be conservative. Do not invent product facts not in the data.\n\n"
            f"DATA:\n{json.dumps(crawl_summary)[:8000]}"
        ),
    }

    try:
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {
                    "role": "system",
                    "content": "Return valid JSON only. No markdown.",
                },
                prompt,
            ],
            temperature=0.2,
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content or "{}"
        return json.loads(text)
    except Exception:
        return None
