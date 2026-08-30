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
    prompt = (
        "You are an expert ecommerce SEO consultant. Analyze this product page data.\n"
        "Return JSON only with keys:\n"
        "- content_quality_score (0-100)\n"
        "- conversion_clarity_score (0-100)\n"
        "- seo_analysis (string, 2-3 sentences on title/meta/headings)\n"
        "- content_analysis (string, 2-3 sentences on description quality)\n"
        "- ai_shopping_notes (string)\n"
        "- fixes (array of max 4 objects with: category, title, problem, why_it_matters, steps array, copy_paste string, effort)\n"
        "Each fix must be actionable with specific copy-paste HTML or JSON-LD when possible.\n"
        "Do not invent product facts.\n\n"
        f"DATA:\n{json.dumps(crawl_summary)[:9000]}"
    )

    try:
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": "Return valid JSON only. No markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content or "{}"
        return json.loads(text)
    except Exception:
        return None
