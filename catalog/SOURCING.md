# Utiliy sourcing policy

Utiliy qualifies products for measurable GEO, LLM, and agentic-shopping decisions.

The active expansion target is at least five newly qualified products in each store category: Bathroom, Kitchen, Closet, Furniture, Cable, and Door.

## Required gates

- The product solves a specific decision gap that an assistant can answer from published measurements, compatibility, exclusions, or model fit.
- The supplier listing resolves to one exact sellable variant with a stable product and variation ID.
- The product is available to ship to United States customers, with item and shipping costs recorded.
- The proposed price is competitive for the exact product.
- Landed cost is no more than 78% of retail.
- Profit after landed cost and a 2.9% + $0.30 payment fee is at least 15% of retail.
- Claims on the product page are supported by manufacturer, supplier, or reliable technical evidence. Missing specifications remain missing.

## Product identifiers

GTIN is optional. A product can qualify without a GTIN when its GEO and agentic-shopping opportunity is strong and every required gate above passes.

- Use a GTIN only when it belongs to the exact brand, model, pack quantity, color, size, and variant being sold.
- Never borrow an OEM GTIN for an aftermarket product.
- Never invent a GTIN, MPN, brand, or private-label identity.
- If no reliable GTIN exists, omit it from product schema and feeds.
- Google Merchant output uses `identifier_exists=no` only when the product has neither a verified GTIN nor a verified brand-and-MPN pair.

## Publication

Every published product must include:

- the deciding fit facts and explicit non-fit cases;
- a concise answer set for the questions an agent is likely to receive;
- current price, availability review date, delivery estimate, and return terms;
- machine-readable product and offer data that matches the visible page;
- supplier mapping kept private for manual fulfillment.
