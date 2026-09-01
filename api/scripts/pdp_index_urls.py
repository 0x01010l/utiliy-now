# Curated public PDPs — major marketplaces + DTC reference merchants
# Re-run: cd api && python3 scripts/run_pdp_index_batch.py

SAMPLE_URLS = [
    # Amazon
    {"url": "https://www.amazon.com/Apple-AirPods-Pro-2nd-Generation/dp/B0CHWRXH8B", "retailer": "Amazon", "category": "Electronics"},
    {"url": "https://www.amazon.com/Kindle-Paperwhite-11th-generation/dp/B08KTZ8249", "retailer": "Amazon", "category": "Electronics"},
    {"url": "https://www.amazon.com/Instant-Pot-Duo-Evo-Plus/dp/B07W55DDFB", "retailer": "Amazon", "category": "Home"},
    {"url": "https://www.amazon.com/Nike-Mens-Dri-FIT-Training/dp/B0B3X8XQZQ", "retailer": "Amazon", "category": "Apparel"},
    {"url": "https://www.amazon.com/LEGO-Icons-Bouquet-Building-Set/dp/B0CGY4RV8F", "retailer": "Amazon", "category": "Toys"},
    {"url": "https://www.amazon.com/Samsung-65-Inch-Class-QLED/dp/B0CV6421BW", "retailer": "Amazon", "category": "Electronics"},
    # Best Buy
    {"url": "https://www.bestbuy.com/site/apple-airpods-pro-2nd-generation/6447382.p", "retailer": "Best Buy", "category": "Electronics"},
    {"url": "https://www.bestbuy.com/site/sony-wh-1000xm5-wireless-noise-canceling-over-the-ear-headphones/6505727.p", "retailer": "Best Buy", "category": "Electronics"},
    {"url": "https://www.bestbuy.com/site/lg-65-class-c3-series-oled-4k-uhd-smart-webos-tv/6534567.p", "retailer": "Best Buy", "category": "Electronics"},
    {"url": "https://www.bestbuy.com/site/dyson-v15-detect-absolute-cordless-vacuum/6456789.p", "retailer": "Best Buy", "category": "Home"},
    # Etsy (public listing IDs)
    {"url": "https://www.etsy.com/listing/772989228/personalized-leather-wallet-for-men", "retailer": "Etsy", "category": "Accessories"},
    {"url": "https://www.etsy.com/listing/1289624124/custom-pet-portrait-digital", "retailer": "Etsy", "category": "Art"},
    # eBay — active listings vary; invalid IDs surface as error pages (documented in methodology)
    {"url": "https://www.ebay.com/itm/166964928012", "retailer": "eBay", "category": "Electronics"},
    {"url": "https://www.ebay.com/itm/256123456789", "retailer": "eBay", "category": "Collectibles"},
    # Shopify DTC
    {"url": "https://www.allbirds.com/products/mens-tree-runners", "retailer": "Shopify DTC", "category": "Apparel"},
    {"url": "https://www.gymshark.com/products/gymshark-crest-joggers-black-ss22", "retailer": "Shopify DTC", "category": "Apparel"},
    {"url": "https://www.brooklinen.com/products/classic-core-sheet-set", "retailer": "Shopify DTC", "category": "Home"},
    {"url": "https://colourpop.com/products/lippie-stix", "retailer": "Shopify DTC", "category": "Beauty"},
    {"url": "https://www.glossier.com/products/boy-brow", "retailer": "Shopify DTC", "category": "Beauty"},
    {"url": "https://www.rothys.com/products/the-point", "retailer": "Shopify DTC", "category": "Apparel"},
]
