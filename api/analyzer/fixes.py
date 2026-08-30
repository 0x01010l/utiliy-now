"""Generate actionable fix suggestions with copy-paste snippets."""

from __future__ import annotations

from typing import Any


def _fix(
    fix_id: str,
    category: str,
    title: str,
    problem: str,
    why: str,
    steps: list[str],
    copy_paste: str = "",
    effort: str = "10 min",
) -> dict[str, Any]:
    return {
        "id": fix_id,
        "category": category,
        "title": title,
        "problem": problem,
        "why_it_matters": why,
        "steps": steps,
        "copy_paste": copy_paste,
        "effort": effort,
    }


def generate_schema_fix_template(crawl: Any, product_name: str, price: str = "0.00") -> str:
    images = [img["src"] for img in crawl.images[:3] if img.get("src")]
    img_json = images if images else ["https://yourstore.com/product-image.jpg"]
    name = (product_name or crawl.title or "Your Product Name").replace('"', '\\"')
    desc = (crawl.meta_description or "Product description here.")[:500].replace('"', '\\"')
    return f"""<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{name}",
  "description": "{desc}",
  "image": {img_json},
  "sku": "SKU-001",
  "brand": {{
    "@type": "Brand",
    "name": "Your Brand"
  }},
  "offers": {{
    "@type": "Offer",
    "url": "{crawl.final_url}",
    "priceCurrency": "USD",
    "price": "{price}",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition"
  }}
}}
</script>"""


def build_fixes(crawl: Any, seo: Any, schema: Any, images: Any, product_info: Any, llm: dict | None) -> list[dict]:
    fixes: list[dict] = []

    if not schema.has_product_schema:
        template = generate_schema_fix_template(crawl, crawl.h1s[0] if crawl.h1s else crawl.title or "")
        fixes.append(
            _fix(
                "add_product_jsonld",
                "structured_data",
                "Add Product JSON-LD to your page",
                "No Product schema was detected in JSON-LD, microdata, or fallback product markup.",
                "Google rich results and AI shopping agents use Product/Offer schema to read price, availability, and identity without guessing from HTML layout.",
                [
                    "Open your theme's product template (Shopify: theme.liquid / product.json section; WooCommerce: single-product.php or SEO plugin).",
                    "Paste the JSON-LD block before </head> or in the product template footer.",
                    "Replace price, SKU, brand, and images with live values from your product object.",
                    "Validate at search.google.com/test/rich-results",
                ],
                copy_paste=template,
                effort="15 min",
            )
        )

    if crawl.title and len(crawl.title) < 25:
        suggested = f"{crawl.h1s[0] if crawl.h1s else crawl.title} | Brand Name"
        fixes.append(
            _fix(
                "expand_title",
                "seo",
                "Expand your title tag",
                f"Current title is only {len(crawl.title)} characters.",
                "Product pages rank for specific long-tail queries. Descriptive titles improve click-through in search.",
                ["Include product name + key attribute + brand.", "Keep under ~60 characters.", "Avoid duplicate supplier titles."],
                copy_paste=f"<title>{suggested}</title>",
                effort="5 min",
            )
        )

    if not crawl.meta_description:
        excerpt = crawl.visible_text[:155] if crawl.visible_text else "Add a compelling product summary here."
        fixes.append(
            _fix(
                "add_meta_description",
                "seo",
                "Write a meta description",
                "Meta description is missing.",
                "Search engines often use this as the snippet. It should match buyer intent.",
                ["Summarize who the product is for and the key benefit.", "Include a differentiator.", "Stay under 155 characters."],
                copy_paste=f'<meta name="description" content="{excerpt}">',
                effort="5 min",
            )
        )

    if not crawl.canonical:
        fixes.append(
            _fix(
                "add_canonical",
                "seo",
                "Add a canonical URL",
                "No canonical link element found.",
                "Variant URLs and tracking parameters can create duplicate indexing without a canonical.",
                ["Add <link rel=\"canonical\" href=\"PREFERRED_URL\"> in <head>.", "Point to the main product URL without unnecessary query params."],
                copy_paste=f'<link rel="canonical" href="{crawl.final_url.split("?")[0]}">',
                effort="5 min",
            )
        )

    imgs_no_alt = [i for i in crawl.images if not i.get("alt")]
    if imgs_no_alt:
        sample = imgs_no_alt[0]
        product = crawl.h1s[0] if crawl.h1s else "product"
        fixes.append(
            _fix(
                "image_alt_text",
                "images",
                f"Add alt text to {len(imgs_no_alt)} images",
                "Product images are missing descriptive alt attributes.",
                "Alt text helps image search, accessibility, and gives AI systems text context for visuals.",
                ["Describe what is shown, not \"image1\".", "Include product name + color/angle for gallery shots.", "Update in your CMS media library or theme."],
                copy_paste=f'<img src="{sample.get("src", "")}" alt="{product} — front view on white background">',
                effort="10 min",
            )
        )

    for field in product_info.missing[:4]:
        fixes.append(
            _fix(
                f"add_{field}",
                "product_information",
                f"Add {field.replace('_', ' ')} to the page",
                f"Buyers and AI agents could not find clear {field} information.",
                "Complete product facts reduce returns, increase trust, and help AI shopping assistants recommend accurately.",
                [f"Add a visible {field} field in specs or FAQ.", f"Mirror the same value in Product JSON-LD if applicable."],
                effort="10 min",
            )
        )

    if llm and llm.get("fixes"):
        for item in llm["fixes"][:5]:
            if isinstance(item, dict) and item.get("title"):
                fixes.append(item)

    return fixes[:12]
