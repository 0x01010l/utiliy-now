"""Azure Computer Vision image analysis."""

from __future__ import annotations

import os
from typing import Any

import httpx

from .image_utils import normalize_image_url


def _basic_image_results(images: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for img in images[:limit]:
        src = normalize_image_url(img.get("src", ""))
        if not src or not src.startswith("http"):
            continue
        alt = img.get("alt", "")
        issues = []
        if not alt:
            issues.append("Missing alt text — add descriptive alt for accessibility and SEO")
        results.append({
            "src": src,
            "alt": alt,
            "caption": alt or "Product gallery image",
            "issues": issues,
            "quality_note": "Gallery image detected",
        })
    return results


def _score_from_images(images: list[dict], results: list[dict]) -> int:
    if not images:
        return 20
    score = 88 if len(images) >= 4 else 75 if len(images) >= 2 else 60
    no_alt = sum(1 for i in images if not i.get("alt"))
    score -= min(30, no_alt * 8)
    vision_issues = sum(len(r.get("issues", [])) for r in results)
    score -= min(20, vision_issues * 5)
    return max(35, min(100, score))


async def analyze_product_images(images: list[dict[str, Any]], limit: int = 8) -> dict[str, Any]:
    if not images:
        return {"analyzed": 0, "results": [], "summary": "No product images found.", "score": 20}

    key = os.getenv("AZURE_VISION_KEY") or os.getenv("AZURE_OPENAI_KEY")
    base = os.getenv("AZURE_OPENAI_ENDPOINT", "https://westus.api.cognitive.microsoft.com/").rstrip("/")
    if "cognitiveservices" not in base and "openai.azure" not in base:
        base = "https://westus.api.cognitive.microsoft.com"

    if not key:
        results = _basic_image_results(images, limit)
        return {
            "analyzed": len(results),
            "results": results,
            "summary": f"Found {len(images)} product images. Vision API not configured — showing gallery analysis.",
            "score": _score_from_images(images, results),
        }

    results: list[dict[str, Any]] = []
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        for img in images[:limit]:
            src = normalize_image_url(img.get("src", ""))
            if not src or not src.startswith("http"):
                continue
            try:
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
                    results.append({
                        "src": src,
                        "alt": img.get("alt", ""),
                        "caption": img.get("alt") or "Product image",
                        "issues": [] if img.get("alt") else ["Missing alt text"],
                        "quality_note": "Could not reach vision API — image URL present",
                    })
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
                results.append({
                    "src": src,
                    "alt": img.get("alt", ""),
                    "caption": img.get("alt") or "Product image",
                    "issues": [] if img.get("alt") else ["Missing alt text"],
                    "error": str(exc)[:100],
                })

    if not results:
        results = _basic_image_results(images, limit)

    summary_parts = []
    if results:
        with_alt = sum(1 for r in results if r.get("alt"))
        summary_parts.append(f"Analyzed {len(results)} images ({with_alt} with alt text).")
        captions = [r.get("caption") for r in results if r.get("caption")]
        if captions:
            summary_parts.append(f"Vision: {captions[0][:120]}")
    else:
        summary_parts.append("No images could be analyzed.")

    return {
        "analyzed": len(results),
        "results": results,
        "summary": " ".join(summary_parts),
        "score": _score_from_images(images, results),
    }
