"""Azure Computer Vision image analysis."""

from __future__ import annotations

import os
from typing import Any

import httpx


async def analyze_product_images(images: list[dict[str, Any]], limit: int = 3) -> dict[str, Any]:
    endpoint = os.getenv("AZURE_VISION_ENDPOINT") or os.getenv("AZURE_OPENAI_ENDPOINT", "").replace("openai", "cognitiveservices")
    key = os.getenv("AZURE_VISION_KEY") or os.getenv("AZURE_OPENAI_KEY")
    if not key or not images:
        return {"analyzed": 0, "results": [], "summary": "Image vision analysis not configured or no images found."}

    # Use Cognitive Services unified endpoint
    base = os.getenv("AZURE_OPENAI_ENDPOINT", "https://westus.api.cognitive.microsoft.com/").rstrip("/")
    if "cognitiveservices" not in base and "openai.azure" not in base:
        base = "https://westus.api.cognitive.microsoft.com"

    results: list[dict[str, Any]] = []
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        for img in images[:limit]:
            src = img.get("src")
            if not src or not src.startswith("http"):
                continue
            try:
                # Analyze via read + caption API
                analyze_url = f"{base}/computervision/imageanalysis:analyze"
                params = {
                    "api-version": "2024-02-01",
                    "features": "caption,denseCaptions,read",
                    "language": "en",
                    "gender-neutral-caption": "true",
                }
                body = {"url": src}
                resp = await client.post(analyze_url, params=params, headers=headers, json=body)
                if resp.status_code != 200:
                    results.append({"src": src, "alt": img.get("alt", ""), "error": f"Vision API {resp.status_code}"})
                    continue
                data = resp.json()
                caption = ""
                captions = data.get("captionResult") or data.get("description", {})
                if isinstance(captions, dict):
                    caption = captions.get("text", "")
                dense = data.get("denseCaptionsResult", {}).get("values", [])
                ocr_text = ""
                read = data.get("readResult", {})
                if read.get("content"):
                    ocr_text = read["content"][:200]

                issues = []
                if not img.get("alt"):
                    issues.append("Missing alt text — vision detected: " + (caption or "product image"))
                if caption and img.get("alt") and caption.lower()[:20] not in img["alt"].lower():
                    issues.append("Alt text may not match image content")

                results.append({
                    "src": src,
                    "alt": img.get("alt", ""),
                    "caption": caption,
                    "dense_captions": [d.get("text", "") for d in dense[:3]],
                    "ocr_snippet": ocr_text,
                    "issues": issues,
                    "quality_note": "Clear product visibility" if caption else "Could not generate caption",
                })
            except Exception as exc:
                results.append({"src": src, "alt": img.get("alt", ""), "error": str(exc)[:100]})

    summary_parts = []
    if results:
        with_alt = sum(1 for r in results if r.get("alt"))
        summary_parts.append(f"Analyzed {len(results)} images ({with_alt} with alt text).")
        captions = [r.get("caption") for r in results if r.get("caption")]
        if captions:
            summary_parts.append(f"Vision: {captions[0][:120]}")
    else:
        summary_parts.append("No images could be analyzed.")

    score = 100
    if not images:
        score = 20
    else:
        no_alt = sum(1 for i in images if not i.get("alt"))
        score -= min(40, no_alt * 15)
        if len(images) < 2:
            score -= 15
        vision_issues = sum(len(r.get("issues", [])) for r in results)
        score -= min(25, vision_issues * 8)

    return {
        "analyzed": len(results),
        "results": results,
        "summary": " ".join(summary_parts),
        "score": max(0, min(100, score)),
    }
