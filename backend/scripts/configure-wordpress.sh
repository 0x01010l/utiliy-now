#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

until docker compose exec -T wordpress test -f /var/www/html/wp-includes/version.php; do
  sleep 3
done

wp() {
  docker compose --profile tools run --rm wpcli wp "$@"
}

if ! wp core is-installed >/dev/null 2>&1; then
  wp core install \
    --url="https://${COMMERCE_DOMAIN}" \
    --title="Utiliy Commerce" \
    --admin_user="${WORDPRESS_ADMIN_USER}" \
    --admin_password="${WORDPRESS_ADMIN_PASSWORD}" \
    --admin_email="${WORDPRESS_ADMIN_EMAIL}" \
    --skip-email
fi

wp plugin install woocommerce --activate
wp plugin install woocommerce-gateway-stripe --activate
wp plugin install redis-cache --activate
wp plugin activate utiliy-commerce
wp theme install storefront --activate
wp redis enable || true

wp option update blogname Utiliy
wp option update blog_public 0
wp option update permalink_structure '/%postname%/'
wp option update woocommerce_currency USD
wp option update woocommerce_allowed_countries specific
wp option update woocommerce_specific_allowed_countries '["US"]' --format=json
wp option update woocommerce_calc_taxes no
wp option update woocommerce_coming_soon no
wp option update woocommerce_store_pages_only no
wp eval 'WC_Install::create_pages();'
wp eval '
$zone_id = 0;
foreach (WC_Shipping_Zones::get_zones() as $zone_data) {
    if (($zone_data["zone_name"] ?? "") === "United States") {
        $zone_id = (int) $zone_data["zone_id"];
        break;
    }
}
$zone = new WC_Shipping_Zone($zone_id);
if (!$zone_id) {
    $zone->set_zone_name("United States");
    $zone->add_location("US", "country");
    $zone->save();
}
$has_free = false;
foreach ($zone->get_shipping_methods(true) as $method) {
    $has_free = $has_free || $method->id === "free_shipping";
}
if (!$has_free) {
    $zone->add_shipping_method("free_shipping");
}
'
wp utiliy sync-catalog /data/products.json
wp rewrite flush --hard

echo "WordPress and WooCommerce are configured."
